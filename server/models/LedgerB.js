const mongoose = require('mongoose');

// Ledger B = external record (e.g. bank statement / payment gateway settlement file)
const ledgerBSchema = new mongoose.Schema({
  statementId: { type: String, required: true, unique: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  date: { type: Date, required: true, index: true },
  refId: { type: String, index: true },
  narration: { type: String },
  batchId: { type: String, index: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LedgerB', ledgerBSchema);
