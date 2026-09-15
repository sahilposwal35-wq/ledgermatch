/**
 * Seeds the database with:
 * 1. Two demo accounts (one maker, one checker) for testing the maker-checker flow
 * 2. A demo batch with controlled anomalies so reconciliation results
 *    are impressive and deterministic:
 *     - ~70% exact matches
 *     - ~10% fuzzy (timing diff, 1-2 days apart)
 *     - ~5% split (batched settlement: 2 A txns = 1 B txn)
 *     - ~5% amount mismatch (rounding/fee deduction)
 *     - ~5% missing on B, ~5% missing on A
 *
 * Usage: node server/scripts/seed.js
 *
 * Demo Accounts:
 *   Maker:   maker@demo.com   / password123
 *   Checker: checker@demo.com / password123
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Batch = require('../models/Batch');
const LedgerA = require('../models/LedgerA');
const LedgerB = require('../models/LedgerB');

const BATCH_ID = 'DEMO-BATCH-001';
const TOTAL = 200;

function randDate(base, offsetDays = 0) {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ledgermatch');

  // --- Seed demo users ---
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('password123', salt);

  const makerUser = await User.findOneAndUpdate(
    { email: 'maker@demo.com' },
    { email: 'maker@demo.com', password: hashedPassword, role: 'maker' },
    { upsert: true, new: true }
  );

  await User.findOneAndUpdate(
    { email: 'checker@demo.com' },
    { email: 'checker@demo.com', password: hashedPassword, role: 'checker' },
    { upsert: true, new: true }
  );

  console.log('Seeded demo accounts: maker@demo.com / checker@demo.com (password: password123)');

  // --- Seed demo batch (owned by the maker) ---
  await LedgerA.deleteMany({ batchId: BATCH_ID });
  await LedgerB.deleteMany({ batchId: BATCH_ID });

  // Create or update the batch, assigning it to the maker user
  await Batch.findOneAndUpdate(
    { name: BATCH_ID },
    { name: BATCH_ID, createdBy: makerUser._id, status: 'created' },
    { upsert: true, new: true }
  );

  const aDocs = [];
  const bDocs = [];
  const baseDate = new Date('2026-07-01');

  let counter = 1;
  const exactCount = Math.floor(TOTAL * 0.70);
  const fuzzyCount = Math.floor(TOTAL * 0.10);
  const splitPairCount = Math.floor(TOTAL * 0.05 / 2);
  const mismatchCount = Math.floor(TOTAL * 0.05);
  const missingBCount = Math.floor(TOTAL * 0.05);
  const missingACount = Math.floor(TOTAL * 0.05);

  // Exact matches
  for (let i = 0; i < exactCount; i++, counter++) {
    const txnId = `TXN${1000 + counter}`;
    const amount = +(Math.random() * 5000 + 100).toFixed(2);
    const date = randDate(baseDate, i % 30);
    aDocs.push({ txnId, amount, date, refId: `REF${counter}`, batchId: BATCH_ID, description: 'Order settlement' });
    bDocs.push({ statementId: `STMT${2000 + counter}`, amount, date, refId: `REF${counter}`, batchId: BATCH_ID, narration: 'NEFT CREDIT' });
  }

  // Fuzzy (timing diff, same amount, refId differs slightly or date shifted)
  for (let i = 0; i < fuzzyCount; i++, counter++) {
    const txnId = `TXN${1000 + counter}`;
    const amount = +(Math.random() * 5000 + 100).toFixed(2);
    const date = randDate(baseDate, i % 30);
    aDocs.push({ txnId, amount, date, refId: `REF${counter}`, batchId: BATCH_ID, description: 'Order settlement' });
    bDocs.push({ statementId: `STMT${2000 + counter}`, amount, date: randDate(date, 1), refId: `REF${counter}`, batchId: BATCH_ID, narration: 'NEFT CREDIT (delayed)' });
  }

  // Split matches (2 A -> 1 B)
  for (let i = 0; i < splitPairCount; i++, counter++) {
    const amt1 = +(Math.random() * 1000 + 50).toFixed(2);
    const amt2 = +(Math.random() * 1000 + 50).toFixed(2);
    const date = randDate(baseDate, i % 30);
    const refBase = `REF${counter}`;
    aDocs.push({ txnId: `TXN${1000 + counter}A`, amount: amt1, date, refId: refBase, batchId: BATCH_ID, description: 'Partial settlement 1' });
    counter++;
    aDocs.push({ txnId: `TXN${1000 + counter}B`, amount: amt2, date, refId: refBase, batchId: BATCH_ID, description: 'Partial settlement 2' });
    bDocs.push({ statementId: `STMT${2000 + counter}`, amount: +(amt1 + amt2).toFixed(2), date, refId: refBase, batchId: BATCH_ID, narration: 'BATCH SETTLEMENT' });
  }

  // Amount mismatch (e.g. bank deducted a fee)
  for (let i = 0; i < mismatchCount; i++, counter++) {
    const txnId = `TXN${1000 + counter}`;
    const amount = +(Math.random() * 5000 + 100).toFixed(2);
    const date = randDate(baseDate, i % 30);
    aDocs.push({ txnId, amount, date, refId: `REF${counter}`, batchId: BATCH_ID, description: 'Order settlement' });
    bDocs.push({ statementId: `STMT${2000 + counter}`, amount: +(amount - 5).toFixed(2), date, refId: `REF${counter}`, batchId: BATCH_ID, narration: 'NEFT CREDIT (fee deducted)' });
  }

  // Missing on B (internal recorded, bank never shows it)
  for (let i = 0; i < missingBCount; i++, counter++) {
    aDocs.push({ txnId: `TXN${1000 + counter}`, amount: +(Math.random() * 5000 + 100).toFixed(2), date: randDate(baseDate, i % 30), refId: `REF${counter}`, batchId: BATCH_ID, description: 'Order settlement' });
  }

  // Missing on A (bank shows it, internal system never recorded it)
  for (let i = 0; i < missingACount; i++, counter++) {
    bDocs.push({ statementId: `STMT${2000 + counter}`, amount: +(Math.random() * 5000 + 100).toFixed(2), date: randDate(baseDate, i % 30), refId: `REF${counter}`, batchId: BATCH_ID, narration: 'UNKNOWN CREDIT' });
  }

  await LedgerA.insertMany(aDocs);
  await LedgerB.insertMany(bDocs);

  console.log(`Seeded batch ${BATCH_ID}: ${aDocs.length} Ledger A txns, ${bDocs.length} Ledger B txns`);
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
