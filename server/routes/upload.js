const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();
const LedgerA = require('../models/LedgerA');
const LedgerB = require('../models/LedgerB');
const Batch = require('../models/Batch');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');

router.use(auth);

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Phase 1: Switch to disk storage for stream parsing
const upload = multer({ dest: uploadDir, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

const LEDGER_A_COLUMNS = ['txnId', 'amount', 'date', 'refId', 'description'];
const LEDGER_B_COLUMNS = ['statementId', 'amount', 'date', 'refId', 'narration'];
const AMOUNT_PATTERN = /^-?\d+(\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function processCsvFile(filePath, mapping, label, isLedgerA, batchId, Model) {
  const parser = fs.createReadStream(filePath).pipe(parse({ columns: true, skip_empty_lines: true, trim: true }));
  
  let headersValidated = false;
  let rowCount = 0;
  let chunk = [];

  for await (const row of parser) {
    if (!headersValidated) {
      const headers = Object.keys(row);
      const requiredMappedKeys = Object.values(mapping);
      const missing = requiredMappedKeys.filter(c => !headers.includes(c));
      
      if (missing.length > 0) {
        throw new Error(`${label} CSV is missing mapped column(s): ${missing.join(', ')}. Found headers: ${headers.join(', ')}`);
      }
      headersValidated = true;
    }

    rowCount++;
    const rawAmount = String(row[mapping.amount] ?? '').trim();
    if (!AMOUNT_PATTERN.test(rawAmount)) {
       throw new Error(`${label} CSV row ${rowCount + 1}: mapped "amount" column must be a plain number with no commas or currency symbols (got "${rawAmount}").`);
    }
    const rawDate = String(row[mapping.date] ?? '').trim();
    if (!DATE_PATTERN.test(rawDate)) {
       throw new Error(`${label} CSV row ${rowCount + 1}: mapped "date" column must be in YYYY-MM-DD format (got "${rawDate}").`);
    }
    if (isNaN(new Date(rawDate).getTime())) {
       throw new Error(`${label} CSV row ${rowCount + 1}: mapped "date" column is not a real calendar date ("${rawDate}")`);
    }

    const doc = isLedgerA ? {
      txnId: row[mapping.txnId], amount: parseFloat(rawAmount), date: new Date(rawDate),
      refId: row[mapping.refId], description: row[mapping.description] || '', batchId
    } : {
      statementId: row[mapping.statementId], amount: parseFloat(rawAmount), date: new Date(rawDate),
      refId: row[mapping.refId], narration: row[mapping.narration] || '', batchId
    };

    chunk.push(doc);

    // Batch insert every 1000 records to keep memory flat
    if (chunk.length >= 1000) {
      await Model.insertMany(chunk);
      chunk = [];
    }
  }

  if (chunk.length > 0) {
    await Model.insertMany(chunk);
  }

  if (rowCount === 0) {
    throw new Error(`${label} CSV has no rows`);
  }

  return rowCount;
}

// Only makers can upload CSVs, and only to batches they created.
router.post('/upload/:batchId', requireRole('maker'), upload.fields([{ name: 'ledgerA', maxCount: 1 }, { name: 'ledgerB', maxCount: 1 }]), async (req, res) => {
  const { batchId } = req.params;
  let ledgerAPath = null;
  let ledgerBPath = null;
  
  try {
    const batch = await Batch.findOne({ name: batchId });
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found. Please create or select a batch first.' });
    }

    // Ownership check: only the batch creator can upload data.
    // .toString() on both sides — a raw ObjectId compared with === against a string
    // will silently and always evaluate false.
    if (batch.createdBy.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Only the batch creator can upload data to this batch' });
    }

    if (!req.files?.ledgerA || !req.files?.ledgerB) {
      return res.status(400).json({ error: 'Both ledgerA and ledgerB CSV files are required' });
    }
    
    if (!req.body.mappingA || !req.body.mappingB) {
      return res.status(400).json({ error: 'Column mapping configuration is required' });
    }

    const mappingA = JSON.parse(req.body.mappingA);
    const mappingB = JSON.parse(req.body.mappingB);

    ledgerAPath = req.files.ledgerA[0].path;
    ledgerBPath = req.files.ledgerB[0].path;

    // Check if files are identical using MD5 hash (memory efficient)
    const [hashA, hashB] = await Promise.all([
      getFileHash(ledgerAPath),
      getFileHash(ledgerBPath)
    ]);

    // Validation 1: Identical Files
    if (hashA === hashB && req.query.force !== 'true') {
      return res.status(409).json({ 
        error: 'Ledger A and Ledger B appear to contain identical source data. Reconciliation may produce artificially high match rates and may not represent a valid reconciliation scenario.',
        requireConfirmation: true
      });
    }

    // Prepare fresh state for this batch
    await LedgerA.deleteMany({ batchId });
    await LedgerB.deleteMany({ batchId });

    // Validation 2: Stream parsing and insertion
    // Run sequentially to ensure clear error reporting if one fails
    const aCount = await processCsvFile(ledgerAPath, mappingA, 'Ledger A', true, batchId, LedgerA);
    const bCount = await processCsvFile(ledgerBPath, mappingB, 'Ledger B', false, batchId, LedgerB);

    batch.ledgerAFileName = req.files.ledgerA[0].originalname;
    batch.ledgerBFileName = req.files.ledgerB[0].originalname;
    batch.ledgerACount = aCount;
    batch.ledgerBCount = bCount;
    batch.status = 'uploaded';
    await batch.save();

    res.json({
      success: true,
      batchId,
      ledgerACount: aCount,
      ledgerBCount: bCount,
      message: 'Upload complete — run reconciliation on this batchId next'
    });
  } catch (err) {
    // If stream parsing threw an error, clean up the partial database inserts
    await LedgerA.deleteMany({ batchId });
    await LedgerB.deleteMany({ batchId });
    res.status(400).json({ error: err.message });
  } finally {
    // Cleanup temporary files
    if (ledgerAPath && fs.existsSync(ledgerAPath)) fs.unlinkSync(ledgerAPath);
    if (ledgerBPath && fs.existsSync(ledgerBPath)) fs.unlinkSync(ledgerBPath);
  }
});

module.exports = router;