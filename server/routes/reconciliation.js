const express = require('express');
const router = express.Router();
const { runReconciliation } = require('../services/matchingEngine');
const Match = require('../models/Match');
const AuditLog = require('../models/AuditLog');

// POST /api/reconcile/:batchId  -> run (or re-run) reconciliation for a batch
router.post('/reconcile/:batchId', async (req, res) => {
  try {
    const summary = await runReconciliation(req.params.batchId);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/matches/:batchId?status=pending_review -> exception queue
router.get('/matches/:batchId', async (req, res) => {
  const filter = { batchId: req.params.batchId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.matchType) filter.matchType = req.query.matchType;
  const matches = await Match.find(filter)
    .populate('ledgerAIds')
    .populate('ledgerBIds')
    .sort({ createdAt: -1 });
  res.json(matches);
});

// PATCH /api/matches/:id/resolve  -> manual override (maker-checker)
router.patch('/matches/:id/resolve', async (req, res) => {
  const { resolvedBy, reason, newStatus } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason is required for manual override' });

  const match = await Match.findById(req.params.id);
  if (!match) return res.status(404).json({ error: 'match not found' });

  match.status = newStatus || 'resolved';
  match.resolution = { resolvedBy, reason, resolvedAt: new Date() };
  await match.save();

  await AuditLog.create({
    batchId: match.batchId, matchId: match._id, action: 'MANUAL_OVERRIDE',
    actor: resolvedBy || 'unknown', reason, snapshot: { previousStatus: match.status, newStatus }
  });

  res.json({ success: true, match });
});

// GET /api/audit/:batchId -> full audit trail for a batch
router.get('/audit/:batchId', async (req, res) => {
  const logs = await AuditLog.find({ batchId: req.params.batchId }).sort({ timestamp: 1 });
  res.json(logs);
});

module.exports = router;
