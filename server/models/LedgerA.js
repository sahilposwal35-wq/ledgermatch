const mongoose = require('mongoose');

// Ledger A = internal system record (e.g. our own order/payment ledger)
const ledgerASchema = new mongoose.Schema({
  txnId: { type: String, required: true, unique: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  date: { type: Date, required: true, index: true },
  refId: { type: String, index: true }, // external reference, may or may not align with Ledger B
  description: { type: String },
  status: { type: String, enum: ['pending', 'settled', 'reversed'], default: 'settled' },
  batchId: { type: String, index: true }, // which reconciliation batch this belongs to
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LedgerA', ledgerASchema);
