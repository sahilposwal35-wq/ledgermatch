const express = require('express');
const router = express.Router();
const Batch = require('../models/Batch');
const LedgerA = require('../models/LedgerA');
const LedgerB = require('../models/LedgerB');
const Match = require('../models/Match');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');

// Apply auth middleware to all batch routes
router.use(auth);

// GET all batches — any authenticated user can view all batches (org-level visibility).
// This is required for maker-checker to work: checkers need to see batches they didn't create.
router.get('/batches', async (req, res) => {
  try {
    const batches = await Batch.find().sort({ createdAt: -1 });
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create batch — only makers can create batches
router.post('/batches', requireRole('maker'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Batch name is required' });
    
    // Check if exists (batch names are globally unique)
    const existing = await Batch.findOne({ name: name.trim() });
    if (existing) return res.status(400).json({ error: 'A batch with this name already exists' });
    
    const batch = await Batch.create({ name: name.trim(), createdBy: req.user.id });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single batch — any authenticated user can view
router.get('/batches/:name', async (req, res) => {
  try {
    const batch = await Batch.findOne({ name: req.params.name });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update batch rules — only the maker who created the batch can update rules
router.patch('/batches/:name/rules', requireRole('maker'), async (req, res) => {
  try {
    const { dateToleranceDays, amountTolerance } = req.body;
    const batch = await Batch.findOne({ name: req.params.name });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    // Ownership check: .toString() on both sides — a raw ObjectId compared
    // with === against a string will silently and always evaluate false.
    if (batch.createdBy.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Only the batch creator can update rules' });
    }
    
    if (dateToleranceDays !== undefined) batch.rules.dateToleranceDays = Number(dateToleranceDays);
    if (amountTolerance !== undefined) batch.rules.amountTolerance = Number(amountTolerance);
    
    await batch.save();
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE reset all account data — only makers, only their own data
router.delete('/reset', requireRole('maker'), async (req, res) => {
  try {
    const userBatches = await Batch.find({ createdBy: req.user.id });
    const batchNames = userBatches.map(b => b.name);
    
    if (batchNames.length > 0) {
      await LedgerA.deleteMany({ batchId: { $in: batchNames } });
      await LedgerB.deleteMany({ batchId: { $in: batchNames } });
      await Match.deleteMany({ batchId: { $in: batchNames } });
      await AuditLog.deleteMany({ batchId: { $in: batchNames } });
      await Batch.deleteMany({ createdBy: req.user.id });
    }
    
    res.json({ success: true, message: 'All account data has been wiped.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
