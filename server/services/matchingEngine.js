const LedgerA = require('../models/LedgerA');
const LedgerB = require('../models/LedgerB');
const Match = require('../models/Match');
const AuditLog = require('../models/AuditLog');
const Batch = require('../models/Batch');

function daysBetween(d1, d2) {
  return Math.abs((new Date(d1) - new Date(d2)) / (1000 * 60 * 60 * 24));
}

/**
 * Runs full reconciliation for a batch.
 */
async function runReconciliation(batchId) {
  const batch = await Batch.findOne({ name: batchId });
  const DATE_TOLERANCE_DAYS = batch?.rules?.dateToleranceDays ?? 2;
  const AMOUNT_TOLERANCE = batch?.rules?.amountTolerance ?? 0.01;

  await AuditLog.create({ batchId, action: 'RECON_RUN_START', actor: 'system' });
  await Match.deleteMany({ batchId });

  // Use .lean() to drastically reduce memory usage
  const aTxns = await LedgerA.find({ batchId }).lean();
  const bTxns = await LedgerB.find({ batchId }).lean();

  const usedA = new Set();
  const usedB = new Set();
  const matches = [];

  // Group B for fast O(1) lookups
  const bByRef = new Map();
  const bByAmount = new Map();

  for (const b of bTxns) {
    if (b.refId) {
      if (!bByRef.has(b.refId)) bByRef.set(b.refId, []);
      bByRef.get(b.refId).push(b);
    }
    const amtKey = b.amount.toFixed(2);
    if (!bByAmount.has(amtKey)) bByAmount.set(amtKey, []);
    bByAmount.get(amtKey).push(b);
  }

  // --- Tier 1: Exact match ---
  for (const a of aTxns) {
    if (usedA.has(String(a._id))) continue;
    const candidates = bByRef.get(a.refId) || [];
    const exactB = candidates.find(b => 
      !usedB.has(String(b._id)) && 
      Math.abs(b.amount - a.amount) < AMOUNT_TOLERANCE && 
      daysBetween(a.date, b.date) === 0
    );
    if (exactB) {
      usedA.add(String(a._id)); usedB.add(String(exactB._id));
      matches.push({
        batchId, ledgerAIds: [a._id], ledgerBIds: [exactB._id],
        matchType: 'exact', confidence: 100, status: 'auto_matched', reasonCode: 'EXACT_MATCH'
      });
    }
  }

  // --- Tier 2: Fuzzy match ---
  for (const a of aTxns) {
    if (usedA.has(String(a._id))) continue;
    const amtKey = a.amount.toFixed(2);
    const candidates = bByAmount.get(amtKey) || [];
    const fuzzyB = candidates.find(b => 
      !usedB.has(String(b._id)) && 
      daysBetween(a.date, b.date) <= DATE_TOLERANCE_DAYS
    );
    if (fuzzyB) {
      usedA.add(String(a._id)); usedB.add(String(fuzzyB._id));
      const dayDiff = daysBetween(a.date, fuzzyB.date);
      matches.push({
        batchId, ledgerAIds: [a._id], ledgerBIds: [fuzzyB._id],
        matchType: 'fuzzy', confidence: dayDiff === 0 ? 90 : 75,
        status: dayDiff === 0 ? 'auto_matched' : 'pending_review', reasonCode: 'TIMING_DIFF'
      });
    }
  }

  // --- Tier 3: Split match (O(A^2) instead of O(A^2 * B)) ---
  const remainingA = aTxns.filter(a => !usedA.has(String(a._id)));
  for (let i = 0; i < remainingA.length; i++) {
    for (let j = i + 1; j < remainingA.length; j++) {
      const a1 = remainingA[i], a2 = remainingA[j];
      if (usedA.has(String(a1._id)) || usedA.has(String(a2._id))) continue;
      
      const sum = (a1.amount + a2.amount).toFixed(2);
      const candidates = bByAmount.get(sum) || [];
      const splitB = candidates.find(b => 
        !usedB.has(String(b._id)) && daysBetween(a1.date, b.date) <= DATE_TOLERANCE_DAYS
      );
      
      if (splitB) {
        usedA.add(String(a1._id)); usedA.add(String(a2._id)); usedB.add(String(splitB._id));
        matches.push({
          batchId, ledgerAIds: [a1._id, a2._id], ledgerBIds: [splitB._id],
          matchType: 'split', confidence: 70, status: 'pending_review', reasonCode: 'BATCHED_SETTLEMENT'
        });
      }
    }
  }

  // --- Tier 4: Amount mismatch ---
  for (const a of aTxns) {
    if (usedA.has(String(a._id))) continue;
    const candidates = bByRef.get(a.refId) || [];
    const b = candidates.find(b => 
      !usedB.has(String(b._id)) && daysBetween(a.date, b.date) <= DATE_TOLERANCE_DAYS
    );
    if (b) {
      usedA.add(String(a._id)); usedB.add(String(b._id));
      matches.push({
        batchId, ledgerAIds: [a._id], ledgerBIds: [b._id],
        matchType: 'amount_mismatch', confidence: 40, status: 'pending_review',
        amountDelta: +(a.amount - b.amount).toFixed(2), reasonCode: 'AMOUNT_DISCREPANCY'
      });
    }
  }

  // --- Remaining ---
  for (const a of aTxns) {
    if (!usedA.has(String(a._id))) {
      matches.push({
        batchId, ledgerAIds: [a._id], ledgerBIds: [],
        matchType: 'unmatched_a', confidence: 0, status: 'pending_review', reasonCode: 'MISSING_ON_LEDGER_B'
      });
    }
  }
  for (const b of bTxns) {
    if (!usedB.has(String(b._id))) {
      matches.push({
        batchId, ledgerAIds: [], ledgerBIds: [b._id],
        matchType: 'unmatched_b', confidence: 0, status: 'pending_review', reasonCode: 'MISSING_ON_LEDGER_A'
      });
    }
  }

  // Bulk Insert Matches (Chunked to save memory)
  const chunkSize = 2000;
  const created = [];
  for (let i = 0; i < matches.length; i += chunkSize) {
    created.push(...(await Match.insertMany(matches.slice(i, i + chunkSize))));
  }

  // Bulk Insert Audit Logs
  const auditLogs = created.map(m => ({
    batchId, matchId: m._id, action: 'AUTO_MATCH', actor: 'system', 
    snapshot: { matchType: m.matchType, confidence: m.confidence }
  }));
  auditLogs.push({
    batchId, action: 'RECON_RUN_COMPLETE', actor: 'system',
    snapshot: { totalMatches: created.length, totalA: aTxns.length, totalB: bTxns.length }
  });
  
  for (let i = 0; i < auditLogs.length; i += chunkSize) {
    await AuditLog.insertMany(auditLogs.slice(i, i + chunkSize));
  }

  return summarize(created, aTxns.length, bTxns.length);
}

function summarize(matches, totalA, totalB) {
  const counts = matches.reduce((acc, m) => {
    acc[m.matchType] = (acc[m.matchType] || 0) + 1;
    return acc;
  }, {});
  const autoMatched = matches.filter(m => m.status === 'auto_matched').length;
  return {
    totalA, totalB, totalMatches: matches.length,
    reconciliationRate: totalA > 0 ? +((autoMatched / totalA) * 100).toFixed(2) : 0,
    breakdown: counts
  };
}

module.exports = { runReconciliation };
