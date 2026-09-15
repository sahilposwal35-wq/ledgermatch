const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { runReconciliation } = require('../services/matchingEngine');
const Match = require('../models/Match');
const AuditLog = require('../models/AuditLog');
const Batch = require('../models/Batch');
const LedgerA = require('../models/LedgerA');
const LedgerB = require('../models/LedgerB');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');

router.use(auth);

// POST /api/reconcile/:batchId  -> run (or re-run) reconciliation for a batch
// Only the maker who created the batch can trigger this.
router.post('/reconcile/:batchId', requireRole('maker'), async (req, res) => {
  try {
    const { batchId } = req.params;
    const batch = await Batch.findOne({ name: batchId });
    
    if (!batch) {
      return res.status(404).json({ success: false, error: 'Batch not found. Please create or select a batch first.' });
    }

    // Ownership check: only the batch creator can run reconciliation.
    // .toString() on both sides — a raw ObjectId compared with === against a string
    // will silently and always evaluate false.
    if (batch.createdBy.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, error: 'Only the batch creator can run reconciliation' });
    }

    const aCount = await LedgerA.countDocuments({ batchId });
    const bCount = await LedgerB.countDocuments({ batchId });

    if (aCount === 0 && bCount === 0) {
      return res.status(400).json({ success: false, error: 'Both Ledger A and Ledger B data are missing for this batch.' });
    }
    if (aCount === 0) {
      return res.status(400).json({ success: false, error: 'Ledger A data is missing for this batch.' });
    }
    if (bCount === 0) {
      return res.status(400).json({ success: false, error: 'Ledger B data is missing for this batch.' });
    }

    // ── WHY THIS TRANSACTION IS NEEDED ──
    // The reconciliation write path does: delete old matches → insert new matches
    // (in chunks) → insert audit log entries (in chunks) → update batch summary.
    // Without a transaction, a server crash between any of these steps would leave
    // the database in an inconsistent state:
    //   - Crash after deleteMany but before insertMany → all matches lost, no replacements
    //   - Crash after Match.insertMany but before AuditLog.insertMany → matches exist
    //     without audit trail, violating the append-only audit guarantee
    //   - Crash after audit logs but before batch.save() → batch.status stuck at
    //     'uploaded' even though matches exist
    //
    // withTransaction() ensures all-or-nothing: either every write commits together,
    // or the entire set is rolled back on failure.
    //
    // NOTE: MongoDB transactions require a replica set (standalone mongod won't work).
    // MongoDB Atlas always runs as a replica set. For local dev, either use Atlas or
    // start mongod with --replSet. If transactions aren't supported, the engine
    // falls through to non-transactional writes (session will be undefined).
    const session = await mongoose.startSession();
    try {
      let summary;
      await session.withTransaction(async () => {
        summary = await runReconciliation(batchId, session);

        // Persist summary to the batch — inside the same transaction so it's
        // atomic with the match/audit writes
        batch.summary = summary;
        batch.status = 'reconciled';
        await batch.save({ session });
      });

      res.json({ success: true, summary });
    } finally {
      await session.endSession();
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET matches (exceptions queue) with pagination — any authenticated user can view
router.get('/matches/:batchId', async (req, res) => {
  try {
    const batch = await Batch.findOne({ name: req.params.batchId });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    const { status, page = 1, limit = 50 } = req.query;
    const filter = { batchId: req.params.batchId };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    
    const [matches, totalCount] = await Promise.all([
      Match.find(filter)
        .populate('ledgerAIds')
        .populate('ledgerBIds')
        .sort({ confidence: -1, _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Match.countDocuments(filter)
    ]);
      
    res.json({
      matches,
      totalCount,
      page: Number(page),
      totalPages: Math.ceil(totalCount / Number(limit))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/matches/:id/resolve  -> manual override (maker-checker enforced)
// Only checkers can approve/reject, and they CANNOT approve matches on batches
// they themselves created (self-approval prevention, enforced at DB level).
router.patch('/matches/:id/resolve', requireRole('checker'), async (req, res) => {
  try {
    const { reason, newStatus } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required for manual override' });

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'invalid match id' });
    }

    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'match not found' });

    const batch = await Batch.findOne({ name: match.batchId });
    if (!batch) return res.status(404).json({ error: 'batch not found for this match' });

    // ── Self-approval prevention (the critical maker-checker control) ──
    // This check is DB-based, not JWT-role-based. Even if a user's role was
    // changed from maker to checker after they created the batch, they still
    // cannot approve their own work. .toString() on BOTH sides because a raw
    // ObjectId compared with === against a string always evaluates false.
    if (batch.createdBy.toString() === req.user.id.toString()) {
      return res.status(403).json({
        error: 'Self-approval is not permitted: you created this batch'
      });
    }

    // Capture previous status BEFORE mutating — the original code had a bug here
    // where it read match.status after already overwriting it, so the snapshot
    // always showed the new status as the "previous" status.
    const previousStatus = match.status;

    // ── WHY THIS TRANSACTION IS NEEDED ──
    // The approval write path does: update match status → create audit log entry.
    // Without a transaction, a crash between match.save() and AuditLog.create()
    // would leave a resolved/rejected match with NO audit trail entry — silently
    // breaking the append-only audit guarantee that the maker-checker pattern
    // depends on. withTransaction() ensures both writes commit together or
    // neither does.
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        match.status = newStatus || 'resolved';
        // resolvedBy is set from the JWT — the server decides who resolved it, not the client
        match.resolution = { resolvedBy: req.user.id, reason, resolvedAt: new Date() };
        await match.save({ session });

        await AuditLog.create([{
          batchId: match.batchId,
          matchId: match._id,
          action: newStatus === 'rejected' ? 'REJECT' : 'MANUAL_OVERRIDE',
          actorType: 'user',
          actorId: req.user.id,
          reason,
          snapshot: { previousStatus, newStatus: match.status }
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    // Populate resolvedBy so the frontend can display the user's email
    await match.populate('resolution.resolvedBy', '-password');

    res.json({ success: true, match });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve match', details: err.message });
  }
});

// GET /api/audit/:batchId -> full audit trail for a batch — any authenticated user can view
router.get('/audit/:batchId', async (req, res) => {
  try {
    const batch = await Batch.findOne({ name: req.params.batchId });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    const logs = await AuditLog.find({ batchId: req.params.batchId })
      .populate('actorId', 'email role')
      .sort({ timestamp: 1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load audit trail', details: err.message });
  }
});

module.exports = router;