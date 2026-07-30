const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  batchId: { type: String, required: true, index: true },
  ledgerAIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LedgerA' }], // array supports split matches
  ledgerBIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LedgerB' }],
  matchType: {
    type: String,
    enum: ['exact', 'fuzzy', 'split', 'unmatched_a', 'unmatched_b', 'amount_mismatch', 'duplicate'],
    required: true
  },
  confidence: { type: Number, min: 0, max: 100, required: true },
  status: {
    type: String,
    enum: ['auto_matched', 'pending_review', 'resolved', 'rejected'],
    default: 'auto_matched'
  },
  amountDelta: { type: Number, default: 0 }, // difference if amount_mismatch
  reasonCode: { type: String }, // e.g. 'TIMING_DIFF', 'ROUNDING', 'MISSING_ON_B'
  resolution: {
    resolvedBy: { type: String }, // maker-checker: who approved the override
    reason: { type: String },     // mandatory justification for manual override
    resolvedAt: { type: Date }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Match', matchSchema);
