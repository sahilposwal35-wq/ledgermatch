const mongoose = require('mongoose');

// Append-only: application code must NEVER call updateOne/deleteOne on this collection.
// Every reconciliation action (auto-match, manual override, rejection) writes a new entry here.
const auditLogSchema = new mongoose.Schema({
  batchId: { type: String, required: true, index: true },
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
  action: {
    type: String,
    enum: ['AUTO_MATCH', 'MANUAL_OVERRIDE', 'REJECT', 'RECON_RUN_START', 'RECON_RUN_COMPLETE'],
    required: true
  },
  actor: { type: String, default: 'system' }, // 'system' for auto actions, username for manual
  reason: { type: String }, // mandatory for MANUAL_OVERRIDE / REJECT
  snapshot: { type: mongoose.Schema.Types.Mixed }, // frozen copy of relevant state at time of action
  timestamp: { type: Date, default: Date.now, immutable: true }
}, { capped: false });

module.exports = mongoose.model('AuditLog', auditLogSchema);
