const LedgerA = require('../models/LedgerA');
const LedgerB = require('../models/LedgerB');
const Match = require('../models/Match');
const AuditLog = require('../models/AuditLog');
const Batch = require('../models/Batch');

/**
 * Returns the absolute difference in calendar days between two dates.
 * Uses simple arithmetic (ms → days) — does NOT account for DST transitions,
 * which could produce fractional results like 0.958 for "same day." This is
 * acceptable because all date inputs are date-only (no time component) from
 * the CSV, so the millisecond values are always at midnight UTC.
 */
function daysBetween(d1, d2) {
  return Math.abs((new Date(d1) - new Date(d2)) / (1000 * 60 * 60 * 24));
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                     RECONCILIATION MATCHING ENGINE                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                            ║
 * ║  Processes records through a CASCADING rules engine with 4 algorithmic     ║
 * ║  tiers + 2 remainder buckets. "Cascading" means each tier only sees        ║
 * ║  records not already consumed by a higher tier. Once a record is matched    ║
 * ║  in Tier 1, it's removed from consideration for Tiers 2–4.                ║
 * ║                                                                            ║
 * ║  TIER 1 — Exact Match     (refId + amount + date must all match)           ║
 * ║  TIER 2 — Fuzzy Match     (amount exact, date within tolerance, no refId)  ║
 * ║  TIER 3 — Split Match     (2 A records sum to 1 B record's amount)         ║
 * ║  TIER 4 — Amount Mismatch (refId + date match, but amount differs)         ║
 * ║  TIER 5 — Unmatched A     (no B record found — "Missing on Ledger B")      ║
 * ║  TIER 6 — Unmatched B     (no A record found — "Missing on Ledger A")      ║
 * ║                                                                            ║
 * ║  CONFIGURABLE THRESHOLDS (per-batch, stored in Batch.rules):               ║
 * ║    dateToleranceDays — max calendar-day gap for fuzzy/split/mismatch        ║
 * ║                        (default: 2 days)                                   ║
 * ║    amountTolerance   — max absolute amount difference for "exact" match     ║
 * ║                        (default: 0.01, i.e. 1 paisa/cent rounding)         ║
 * ║                                                                            ║
 * ║  TIE-BREAKING: Within each tier, when multiple B candidates qualify for     ║
 * ║  the same A record, the FIRST candidate in insertion order wins. This is    ║
 * ║  deterministic (MongoDB returns documents in natural/insertion order with   ║
 * ║  .lean()), but does NOT optimize for "best" match (e.g., closest date).    ║
 * ║  This is a deliberate simplicity trade-off: a greedy first-match strategy  ║
 * ║  is O(N) per tier and easy to explain, while optimal assignment (e.g.,     ║
 * ║  Hungarian algorithm) would be O(N³) and harder to defend in an interview. ║
 * ║                                                                            ║
 * ║  LOOKUP STRATEGY: Two hash maps index B records for O(1) candidate lookup: ║
 * ║    bByRef    — Map<refId, LedgerB[]>   (used by Tiers 1 and 4)             ║
 * ║    bByAmount — Map<amount, LedgerB[]>  (used by Tiers 2 and 3)             ║
 * ║  This avoids O(N²) nested scans for most tiers. Tier 3 (split match) is    ║
 * ║  O(A²) in the worst case because it checks all pairs of remaining A        ║
 * ║  records, but the B lookup for each pair is still O(1) via bByAmount.      ║
 * ║                                                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * @param {string} batchId - The batch name/ID to reconcile.
 * @param {import('mongoose').ClientSession} [session] - Optional Mongoose session.
 *   When provided, all write operations (deletes, inserts) are executed within this
 *   session's transaction, ensuring atomicity. If the server crashes between any
 *   of the writes, the entire transaction is rolled back — you never end up with
 *   matches that have no audit trail, or a half-deleted set of old matches.
 *   Reads (LedgerA.find, LedgerB.find, Batch.findOne) run outside the transaction
 *   because they access source data that isn't modified during reconciliation.
 */
async function runReconciliation(batchId, session) {
  const batch = await Batch.findOne({ name: batchId });
  const DATE_TOLERANCE_DAYS = batch?.rules?.dateToleranceDays ?? 2;
  const AMOUNT_TOLERANCE = batch?.rules?.amountTolerance ?? 0.01;

  // ── All writes below use { session } so they participate in the caller's
  // ── transaction. Mongoose ignores { session: undefined }, so this function
  // ── also works without a session (e.g., in tests without a replica set).

  await AuditLog.create([{ batchId, action: 'RECON_RUN_START', actorType: 'system' }], { session });
  await Match.deleteMany({ batchId }, { session });

  // Use .lean() to drastically reduce memory usage — returns plain JS objects
  // instead of full Mongoose documents (which carry change-tracking overhead)
  const aTxns = await LedgerA.find({ batchId }).lean();
  const bTxns = await LedgerB.find({ batchId }).lean();

  // Track which records have been consumed by a match. Once a record's _id is
  // in usedA or usedB, no subsequent tier will consider it. This is what makes
  // the cascade work — higher-confidence tiers get priority.
  const usedA = new Set();
  const usedB = new Set();
  const matches = [];

  // ── Build two hash maps for O(1) candidate lookups ──
  // bByRef:    groups B records by refId  → used by Tier 1 (exact) and Tier 4 (amount mismatch)
  // bByAmount: groups B records by amount → used by Tier 2 (fuzzy) and Tier 3 (split)
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

  // ╔════════════════════════════════════════════════════════════════════════════╗
  // ║  TIER 1 — EXACT MATCH                                                    ║
  // ║                                                                           ║
  // ║  Rule: A.refId === B.refId                                                ║
  // ║        AND |A.amount - B.amount| < AMOUNT_TOLERANCE (default 0.01)        ║
  // ║        AND A.date === B.date (0 calendar days apart)                      ║
  // ║                                                                           ║
  // ║  Lookup: O(1) via bByRef hash map.                                        ║
  // ║  Confidence: 100% — auto-matched, no human review needed.                 ║
  // ║                                                                           ║
  // ║  Tie-breaking: if multiple B records share the same refId, amount, and    ║
  // ║  date, the FIRST one in insertion order wins (Array.find returns the      ║
  // ║  first match). This is deterministic but not optimized.                   ║
  // ╚════════════════════════════════════════════════════════════════════════════╝
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

  // ╔════════════════════════════════════════════════════════════════════════════╗
  // ║  TIER 2 — FUZZY MATCH (TIMING DIFFERENCE)                                ║
  // ║                                                                           ║
  // ║  Rule: A.amount === B.amount (exact, matched via hash map key)            ║
  // ║        AND |A.date - B.date| <= DATE_TOLERANCE_DAYS (default 2)           ║
  // ║        refId is NOT compared — this tier catches cases where the bank     ║
  // ║        processed a payment a few days late, potentially under a           ║
  // ║        different reference number.                                        ║
  // ║                                                                           ║
  // ║  Lookup: O(1) via bByAmount hash map (keyed on amount.toFixed(2)).        ║
  // ║                                                                           ║
  // ║  Confidence scoring:                                                      ║
  // ║    - 90% if dates are the same day (0 days apart) — likely the same       ║
  // ║      transaction with a missing or different refId                        ║
  // ║    - 75% if dates differ by 1–2 days — likely a settlement delay          ║
  // ║                                                                           ║
  // ║  Auto-match vs. pending review:                                           ║
  // ║    - Same day (90% confidence) → auto_matched (no human review)           ║
  // ║    - Different day (75% confidence) → pending_review (needs checker)      ║
  // ║                                                                           ║
  // ║  WHY refId IS NOT CHECKED HERE:                                           ║
  // ║  In real bank reconciliation, a company records a sale with reference     ║
  // ║  "INV-1002" but the bank statement shows the deposit with a completely   ║
  // ║  different reference like "MISC-REF-99" or no reference at all. The      ║
  // ║  amount is the strongest signal in this scenario. If we required refId    ║
  // ║  to match, these legitimate payments would fall through to "unmatched."  ║
  // ║                                                                           ║
  // ║  WHAT THIS IS NOT: This is not string-similarity matching (Levenshtein,  ║
  // ║  Jaro-Winkler, etc.) on descriptions or narrations. It's a simple        ║
  // ║  amount-equality + date-proximity check. A string-similarity tier could  ║
  // ║  be added between Tier 2 and Tier 3 to catch cases where amounts are     ║
  // ║  exact and narrations are similar but dates differ by more than the       ║
  // ║  tolerance — but this would add a dependency and complexity for marginal  ║
  // ║  gain in most reconciliation scenarios.                                   ║
  // ║                                                                           ║
  // ║  Tie-breaking: same as Tier 1 — first qualifying candidate in insertion  ║
  // ║  order wins. No optimization for closest date or best refId similarity.  ║
  // ╚════════════════════════════════════════════════════════════════════════════╝
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

  // ╔════════════════════════════════════════════════════════════════════════════╗
  // ║  TIER 3 — SPLIT MATCH (1-TO-MANY / BATCHED SETTLEMENT)                   ║
  // ║                                                                           ║
  // ║  Rule: A1.amount + A2.amount === B.amount (exact sum)                     ║
  // ║        AND |A1.date - B.date| <= DATE_TOLERANCE_DAYS                      ║
  // ║        refId is NOT compared.                                             ║
  // ║                                                                           ║
  // ║  Complexity: O(A²) over remaining A records × O(1) B lookup per pair.     ║
  // ║  Only checks PAIRS (2 A → 1 B). Does not check triplets or higher — a    ║
  // ║  deliberate simplification since 3+-way splits are rare in practice and   ║
  // ║  would require O(A³) or combinatorial enumeration.                        ║
  // ║                                                                           ║
  // ║  Confidence: 70% — always pending_review (needs checker approval).        ║
  // ║                                                                           ║
  // ║  Date check uses A1's date only (not A2's) — assumes both partial         ║
  // ║  transactions are close in time. This could miss edge cases where A2 is   ║
  // ║  significantly later, but keeps the logic simple.                         ║
  // ║                                                                           ║
  // ║  Tie-breaking: first qualifying pair (by outer loop index) wins.          ║
  // ╚════════════════════════════════════════════════════════════════════════════╝
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

  // ╔════════════════════════════════════════════════════════════════════════════╗
  // ║  TIER 4 — AMOUNT MISMATCH (HIDDEN FEE / ROUNDING ERROR)                  ║
  // ║                                                                           ║
  // ║  Rule: A.refId === B.refId                                                ║
  // ║        AND |A.date - B.date| <= DATE_TOLERANCE_DAYS                       ║
  // ║        AND amounts DIFFER (no amount check — any delta qualifies)         ║
  // ║                                                                           ║
  // ║  This tier catches the "hidden bank fee" scenario: e.g., the company     ║
  // ║  records a ₹1,200 sale, but the bank shows ₹1,190 because of a ₹10      ║
  // ║  transaction fee deducted at settlement.                                  ║
  // ║                                                                           ║
  // ║  The amount delta (A.amount - B.amount) is stored on the Match document  ║
  // ║  so the reviewer can see the exact discrepancy.                           ║
  // ║                                                                           ║
  // ║  Confidence: 40% — always pending_review.                                 ║
  // ║  No upper bound on amount delta — even large discrepancies are surfaced  ║
  // ║  rather than silently dropped. The checker decides whether to approve.    ║
  // ║                                                                           ║
  // ║  Tie-breaking: first qualifying candidate in insertion order.             ║
  // ╚════════════════════════════════════════════════════════════════════════════╝
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

  // ── TIERS 5 & 6 — UNMATCHED RECORDS ──
  // Any A record not consumed by Tiers 1–4 is "Missing on Ledger B" (the bank
  // has no corresponding deposit). Any B record not consumed is "Missing on
  // Ledger A" (the company has no record of this incoming payment).
  // Confidence: 0% — always pending_review.
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
    created.push(...(await Match.insertMany(matches.slice(i, i + chunkSize), { session })));
  }

  // Bulk Insert Audit Logs
  const auditLogs = created.map(m => ({
    batchId, matchId: m._id, action: 'AUTO_MATCH', actorType: 'system', 
    snapshot: { matchType: m.matchType, confidence: m.confidence }
  }));
  auditLogs.push({
    batchId, action: 'RECON_RUN_COMPLETE', actorType: 'system',
    snapshot: { totalMatches: created.length, totalA: aTxns.length, totalB: bTxns.length }
  });
  
  for (let i = 0; i < auditLogs.length; i += chunkSize) {
    await AuditLog.insertMany(auditLogs.slice(i, i + chunkSize), { session });
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
