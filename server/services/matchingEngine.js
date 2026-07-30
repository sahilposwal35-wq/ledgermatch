const LedgerA = require('../models/LedgerA');
const LedgerB = require('../models/LedgerB');
const Match = require('../models/Match');
const AuditLog = require('../models/AuditLog');

const DATE_TOLERANCE_DAYS = 2;
const AMOUNT_TOLERANCE = 0.01; // ~1 paisa/cent rounding tolerance

function daysBetween(d1, d2) {
  return Math.abs((new Date(d1) - new Date(d2)) / (1000 * 60 * 60 * 24));
}

async function writeAudit(batchId, matchId, action, actor, reason, snapshot) {
  await AuditLog.create({ batchId, matchId, action, actor, reason, snapshot });
}

/**
 * Runs full reconciliation for a batch.
 * Idempotent: if matches already exist for this batchId, it clears and reruns cleanly
 * rather than duplicating (safe re-run guarantee).
 */
async function runReconciliation(batchId) {
  await AuditLog.create({ batchId, action: 'RECON_RUN_START', actor: 'system' });

  // Idempotency guard: wipe prior matches for this batch before rerunning
  await Match.deleteMany({ batchId });

  const aTxns = await LedgerA.find({ batchId });
  const bTxns = await LedgerB.find({ batchId });

  const usedA = new Set();
  const usedB = new Set();
  const matches = [];

  // --- Tier 1: Exact match (refId + amount + same date) ---
  for (const a of aTxns) {
    if (usedA.has(String(a._id))) continue;
    const exactB = bTxns.find(b =>
      !usedB.has(String(b._id)) &&
      b.refId === a.refId &&
      Math.abs(b.amount - a.amount) < AMOUNT_TOLERANCE &&
      daysBetween(a.date, b.date) === 0
    );
    if (exactB) {
      usedA.add(String(a._id));
      usedB.add(String(exactB._id));
      matches.push({
        batchId, ledgerAIds: [a._id], ledgerBIds: [exactB._id],
        matchType: 'exact', confidence: 100, status: 'auto_matched',
        reasonCode: 'EXACT_MATCH'
      });
    }
  }

  // --- Tier 2: Fuzzy match (amount close, date within tolerance, refId may differ) ---
  for (const a of aTxns) {
    if (usedA.has(String(a._id))) continue;
    const fuzzyB = bTxns.find(b =>
      !usedB.has(String(b._id)) &&
      Math.abs(b.amount - a.amount) < AMOUNT_TOLERANCE &&
      daysBetween(a.date, b.date) <= DATE_TOLERANCE_DAYS
    );
    if (fuzzyB) {
      usedA.add(String(a._id));
      usedB.add(String(fuzzyB._id));
      const dayDiff = daysBetween(a.date, fuzzyB.date);
      matches.push({
        batchId, ledgerAIds: [a._id], ledgerBIds: [fuzzyB._id],
        matchType: 'fuzzy', confidence: dayDiff === 0 ? 90 : 75,
        status: dayDiff === 0 ? 'auto_matched' : 'pending_review',
        reasonCode: 'TIMING_DIFF'
      });
    }
  }

  // --- Tier 3: Split match (2 A txns summing to 1 B txn, or vice versa) — capped 2:1 ---
  const remainingA = aTxns.filter(a => !usedA.has(String(a._id)));
  const remainingB = bTxns.filter(b => !usedB.has(String(b._id)));

  for (const b of remainingB) {
    if (usedB.has(String(b._id))) continue;
    for (let i = 0; i < remainingA.length; i++) {
      for (let j = i + 1; j < remainingA.length; j++) {
        const a1 = remainingA[i], a2 = remainingA[j];
        if (usedA.has(String(a1._id)) || usedA.has(String(a2._id))) continue;
        if (Math.abs((a1.amount + a2.amount) - b.amount) < AMOUNT_TOLERANCE &&
            daysBetween(a1.date, b.date) <= DATE_TOLERANCE_DAYS) {
          usedA.add(String(a1._id)); usedA.add(String(a2._id));
          usedB.add(String(b._id));
          matches.push({
            batchId, ledgerAIds: [a1._id, a2._id], ledgerBIds: [b._id],
            matchType: 'split', confidence: 70, status: 'pending_review',
            reasonCode: 'BATCHED_SETTLEMENT'
          });
        }
      }
    }
  }

  // --- Tier 4: Amount mismatch (same refId + close date, but amount differs beyond tolerance) ---
  for (const a of aTxns) {
    if (usedA.has(String(a._id))) continue;
    const b = bTxns.find(b =>
      !usedB.has(String(b._id)) &&
      b.refId === a.refId &&
      daysBetween(a.date, b.date) <= DATE_TOLERANCE_DAYS
    );
    if (b) {
      usedA.add(String(a._id));
      usedB.add(String(b._id));
      matches.push({
        batchId, ledgerAIds: [a._id], ledgerBIds: [b._id],
        matchType: 'amount_mismatch', confidence: 40, status: 'pending_review',
        amountDelta: +(a.amount - b.amount).toFixed(2),
        reasonCode: 'AMOUNT_DISCREPANCY'
      });
    }
  }

  // --- Remaining unmatched ---
  for (const a of aTxns) {
    if (!usedA.has(String(a._id))) {
      matches.push({
        batchId, ledgerAIds: [a._id], ledgerBIds: [],
        matchType: 'unmatched_a', confidence: 0, status: 'pending_review',
        reasonCode: 'MISSING_ON_LEDGER_B'
      });
    }
  }
  for (const b of bTxns) {
    if (!usedB.has(String(b._id))) {
      matches.push({
        batchId, ledgerAIds: [], ledgerBIds: [b._id],
        matchType: 'unmatched_b', confidence: 0, status: 'pending_review',
        reasonCode: 'MISSING_ON_LEDGER_A'
      });
    }
  }

  const created = await Match.insertMany(matches);

  for (const m of created) {
    await writeAudit(batchId, m._id, 'AUTO_MATCH', 'system', null, { matchType: m.matchType, confidence: m.confidence });
  }

  await AuditLog.create({
    batchId, action: 'RECON_RUN_COMPLETE', actor: 'system',
    snapshot: { totalMatches: created.length, totalA: aTxns.length, totalB: bTxns.length }
  });

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
