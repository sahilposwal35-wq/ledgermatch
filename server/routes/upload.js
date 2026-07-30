const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const router = express.Router();
const LedgerA = require('../models/LedgerA');
const LedgerB = require('../models/LedgerB');

// Files are parsed in memory, never written to disk — no cleanup needed, nothing lingers
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const LEDGER_A_COLUMNS = ['txnId', 'amount', 'date', 'refId', 'description'];
const LEDGER_B_COLUMNS = ['statementId', 'amount', 'date', 'refId', 'narration'];

function parseCsvBuffer(buffer) {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
}

function validateRows(rows, requiredColumns, label) {
  if (rows.length === 0) {
    throw new Error(`${label} CSV has no rows`);
  }
  const headers = Object.keys(rows[0]);
  const missing = requiredColumns.filter(c => !headers.includes(c));
  if (missing.length > 0) {
    throw new Error(`${label} CSV is missing required column(s): ${missing.join(', ')}. Expected headers: ${requiredColumns.join(', ')}`);
  }
  rows.forEach((row, i) => {
    if (isNaN(parseFloat(row.amount))) {
      throw new Error(`${label} CSV row ${i + 2}: "amount" is not a valid number ("${row.amount}")`);
    }
    if (isNaN(new Date(row.date).getTime())) {
      throw new Error(`${label} CSV row ${i + 2}: "date" is not a valid date ("${row.date}"). Use YYYY-MM-DD.`);
    }
  });
}

// POST /api/upload/:batchId  — multipart form with fields "ledgerA" and "ledgerB", each a CSV file
router.post('/upload/:batchId', upload.fields([{ name: 'ledgerA', maxCount: 1 }, { name: 'ledgerB', maxCount: 1 }]), async (req, res) => {
  const { batchId } = req.params;
  try {
    if (!req.files?.ledgerA || !req.files?.ledgerB) {
      return res.status(400).json({ error: 'Both ledgerA and ledgerB CSV files are required' });
    }

    const aRows = parseCsvBuffer(req.files.ledgerA[0].buffer);
    const bRows = parseCsvBuffer(req.files.ledgerB[0].buffer);

    validateRows(aRows, LEDGER_A_COLUMNS, 'Ledger A');
    validateRows(bRows, LEDGER_B_COLUMNS, 'Ledger B');

    // Same batchId = same reconciliation replaces any prior data for this batch (mirrors idempotent re-run)
    await LedgerA.deleteMany({ batchId });
    await LedgerB.deleteMany({ batchId });

    const aDocs = aRows.map(r => ({
      txnId: r.txnId, amount: parseFloat(r.amount), date: new Date(r.date),
      refId: r.refId, description: r.description || '', batchId
    }));
    const bDocs = bRows.map(r => ({
      statementId: r.statementId, amount: parseFloat(r.amount), date: new Date(r.date),
      refId: r.refId, narration: r.narration || '', batchId
    }));

    await LedgerA.insertMany(aDocs);
    await LedgerB.insertMany(bDocs);

    res.json({
      success: true,
      batchId,
      ledgerACount: aDocs.length,
      ledgerBCount: bDocs.length,
      message: 'Upload complete — run reconciliation on this batchId next'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
