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

router.use(auth);

// POST /api/reconcile/:batchId  -> run (or re-run) reconciliation for a batch
router.post('/reconcile/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const batch = await Batch.findOne({ name: batchId, userId: req.user.id });
    
    if (!batch) {
      return res.status(404).json({ success: false, error: 'Batch not found. Please create or select a batch first.' });
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

    const summary = await runReconciliation(batchId);
    
    // Persist summary to the batch
    batch.summary = summary;
    batch.status = 'reconciled';
    await batch.save();

    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET matches (exceptions queue) with pagination
router.get('/matches/:batchId', async (req, res) => {
  try {
    const batch = await Batch.findOne({ name: req.params.batchId, userId: req.user.id });
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

// PATCH /api/matches/:id/resolve  -> manual override (maker-checker)
router.patch('/matches/:id/resolve', async (req, res) => {
  try {
    const { resolvedBy, reason, newStatus } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required for manual override' });

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'invalid match id' });
    }

    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'match not found' });

    const batch = await Batch.findOne({ name: match.batchId, userId: req.user.id });
    if (!batch) return res.status(403).json({ error: 'unauthorized to resolve matches for this batch' });

    match.status = newStatus || 'resolved';
    match.resolution = { resolvedBy, reason, resolvedAt: new Date() };
    await match.save();

    await AuditLog.create({
      batchId: match.batchId, matchId: match._id, action: 'MANUAL_OVERRIDE',
      actor: resolvedBy || 'unknown', reason, snapshot: { previousStatus: match.status, newStatus }
    });

    res.json({ success: true, match });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve match', details: err.message });
  }
});

// GET /api/audit/:batchId -> full audit trail for a batch
router.get('/audit/:batchId', async (req, res) => {
  try {
    const batch = await Batch.findOne({ name: req.params.batchId, userId: req.user.id });
    if (!batch) return res.status(403).json({ error: 'unauthorized' });

    const logs = await AuditLog.find({ batchId: req.params.batchId }).sort({ timestamp: 1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load audit trail', details: err.message });
  }
});

module.exports = router;