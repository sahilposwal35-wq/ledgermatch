const express = require('express');
const router = express.Router();
const Batch = require('../models/Batch');
const LedgerA = require('../models/LedgerA');
const LedgerB = require('../models/LedgerB');
const Match = require('../models/Match');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');

// Apply auth middleware to all batch routes
router.use(auth);

// GET all batches
router.get('/batches', async (req, res) => {
  try {
    const batches = await Batch.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create batch
router.post('/batches', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Batch name is required' });
    
    // Check if exists
    const existing = await Batch.findOne({ name: name.trim(), userId: req.user.id });
    if (existing) return res.status(400).json({ error: 'A batch with this name already exists' });
    
    const batch = await Batch.create({ name: name.trim(), userId: req.user.id });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single batch
router.get('/batches/:name', async (req, res) => {
  try {
    const batch = await Batch.findOne({ name: req.params.name, userId: req.user.id });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update batch rules
router.patch('/batches/:name/rules', async (req, res) => {
  try {
    const { dateToleranceDays, amountTolerance } = req.body;
    const batch = await Batch.findOne({ name: req.params.name, userId: req.user.id });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    
    if (dateToleranceDays !== undefined) batch.rules.dateToleranceDays = Number(dateToleranceDays);
    if (amountTolerance !== undefined) batch.rules.amountTolerance = Number(amountTolerance);
    
    await batch.save();
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE reset all account data (for the logged-in user)
router.delete('/reset', async (req, res) => {
  try {
    const userBatches = await Batch.find({ userId: req.user.id });
    const batchNames = userBatches.map(b => b.name);
    
    if (batchNames.length > 0) {
      await LedgerA.deleteMany({ batchId: { $in: batchNames } });
      await LedgerB.deleteMany({ batchId: { $in: batchNames } });
      await Match.deleteMany({ batchId: { $in: batchNames } });
      await AuditLog.deleteMany({ batchId: { $in: batchNames } });
      await Batch.deleteMany({ userId: req.user.id });
    }
    
    res.json({ success: true, message: 'All account data has been wiped.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
