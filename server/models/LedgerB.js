const mongoose = require('mongoose');

// Ledger B = external record (e.g. bank statement / payment gateway settlement file)
const ledgerBSchema = new mongoose.Schema({
  statementId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  date: { type: Date, required: true, index: true },
  refId: { type: String, index: true },
  narration: { type: String },
  batchId: { type: String, index: true },
  createdAt: { type: Date, default: Date.now }
});

// statementId only needs to be unique WITHIN a batch, not across the whole collection
ledgerBSchema.index({ batchId: 1, statementId: 1 }, { unique: true });

module.exports = mongoose.model('LedgerB', ledgerBSchema);