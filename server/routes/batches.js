const express = require('express');
const router = express.Router();
const Batch = require('../models/Batch');

// GET all batches
router.get('/batches', async (req, res) => {
  try {
    const batches = await Batch.find().sort({ createdAt: -1 });
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
    const existing = await Batch.findOne({ name: name.trim() });
    if (existing) return res.status(400).json({ error: 'A batch with this name already exists' });
    
    const batch = await Batch.create({ name: name.trim() });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single batch
router.get('/batches/:name', async (req, res) => {
  try {
    const batch = await Batch.findOne({ name: req.params.name });
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
    const batch = await Batch.findOne({ name: req.params.name });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    
    if (dateToleranceDays !== undefined) batch.rules.dateToleranceDays = Number(dateToleranceDays);
    if (amountTolerance !== undefined) batch.rules.amountTolerance = Number(amountTolerance);
    
    await batch.save();
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
