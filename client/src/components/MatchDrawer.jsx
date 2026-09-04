import { useState } from 'react';
import { formatAmount, formatDate, formatDateTime, MATCH_TYPE_LABEL, REASON_LABEL } from '../utils/format';
import { resolveMatch } from '../services/api';

export default function MatchDrawer({ match, onClose, onResolved }) {
  const [actor, setActor] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const alreadyResolved = match.status === 'resolved' || match.status === 'rejected';

  async function handleAction(newStatus) {
    if (!reason.trim()) {
      setError('A reason is required before this action can be recorded.');
      return;
    }
    if (!actor.trim()) {
      setError('Enter your name/ID as the resolving reviewer.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { match: updated } = await resolveMatch(match._id, { resolvedBy: actor, reason, newStatus });
      onResolved(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="drawer-title">
              <span className={`badge badge-${match.matchType}`}>{MATCH_TYPE_LABEL[match.matchType] || match.matchType}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
              {REASON_LABEL[match.reasonCode] || match.reasonCode}
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {match.ledgerAIds?.length > 0 && (
          <div className="drawer-section">
            <div className="drawer-section-label">Ledger A (Internal) — {match.ledgerAIds.length} txn{match.ledgerAIds.length > 1 ? 's' : ''}</div>
            {match.ledgerAIds.map(a => (
              <div className="txn-card" key={a._id}>
                <div className="txn-card-row"><span className="txn-label">Txn ID</span><span className="mono">{a.txnId}</span></div>
                <div className="txn-card-row"><span className="txn-label">Amount</span><span className="amount mono">₹{formatAmount(a.amount)}</span></div>
                <div className="txn-card-row"><span className="txn-label">Date</span><span>{formatDate(a.date)}</span></div>
                <div className="txn-card-row"><span className="txn-label">Ref</span><span className="mono">{a.refId}</span></div>
              </div>
            ))}
          </div>
        )}

        {match.ledgerBIds?.length > 0 && (
          <div className="drawer-section">
            <div className="drawer-section-label">Ledger B (External) — {match.ledgerBIds.length} txn{match.ledgerBIds.length > 1 ? 's' : ''}</div>
            {match.ledgerBIds.map(b => (
              <div className="txn-card" key={b._id}>
                <div className="txn-card-row"><span className="txn-label">Statement ID</span><span className="mono">{b.statementId}</span></div>
                <div className="txn-card-row"><span className="txn-label">Amount</span><span className="amount mono">₹{formatAmount(b.amount)}</span></div>
                <div className="txn-card-row"><span className="txn-label">Date</span><span>{formatDate(b.date)}</span></div>
                <div className="txn-card-row"><span className="txn-label">Ref</span><span className="mono">{b.refId}</span></div>
              </div>
            ))}
          </div>
        )}

        <div className="drawer-section">
          <div className="drawer-section-label">Maker-Checker Review</div>

          {alreadyResolved ? (
            <div className="already-resolved">
              <div style={{ marginBottom: 8 }}>
                <strong style={{ color: match.status === 'resolved' ? 'var(--status-success)' : 'var(--status-error)' }}>
                  {match.status === 'resolved' ? 'Resolved' : 'Rejected'}
                </strong>
                {' '}by {match.resolution?.resolvedBy || 'unknown'} on {formatDateTime(match.resolution?.resolvedAt)}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{match.resolution?.reason}"</div>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label>Reviewer Name / ID</label>
                <input
                  className="form-input"
                  placeholder="e.g. jdoe"
                  value={actor}
                  onChange={e => setActor(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Justification</label>
                <textarea
                  className="form-textarea"
                  placeholder="Required justification for the audit trail..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
              </div>
              {error && <div className="error-banner" style={{ marginBottom: 0, marginTop: 16 }}>{error}</div>}
              <div className="resolve-actions">
                <button className="btn-approve" disabled={submitting} onClick={() => handleAction('resolved')}>
                  {submitting ? 'Recording…' : 'Approve Match'}
                </button>
                <button className="btn-reject" disabled={submitting} onClick={() => handleAction('rejected')}>
                  {submitting ? 'Recording…' : 'Reject'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}