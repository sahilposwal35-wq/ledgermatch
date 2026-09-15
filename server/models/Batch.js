const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, index: true },
  // Tracks which user (maker) created this batch.
  // Used for write-access ownership checks and self-approval prevention.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ledgerAFileName: { type: String },
  ledgerBFileName: { type: String },
  ledgerACount: { type: Number, default: 0 },
  ledgerBCount: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['created', 'uploaded', 'reconciled'], 
    default: 'created' 
  },
  rules: {
    dateToleranceDays: { type: Number, default: 2 },
    amountTolerance: { type: Number, default: 0.01 }
  },
  summary: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Batch', batchSchema);
