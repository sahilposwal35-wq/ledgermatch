import { useState } from 'react';
import { formatAmount, formatDate, formatDateTime, MATCH_TYPE_LABEL, REASON_LABEL } from '../utils/format';
import { resolveMatch } from '../services/api';

export default function MatchDrawer({ match, onClose, onResolved, user }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const alreadyResolved = match.status === 'resolved' || match.status === 'rejected';
  const isChecker = user?.role === 'checker';

  async function handleAction(newStatus) {
    if (!reason.trim()) {
      setError('A justification is required before this action can be recorded.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { match: updated } = await resolveMatch(match._id, reason, newStatus);
      onResolved(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function getResolverDisplay(resolution) {
    if (!resolution?.resolvedBy) return 'unknown';
    if (typeof resolution.resolvedBy === 'object' && resolution.resolvedBy.email) {
      return resolution.resolvedBy.email;
    }
    return resolution.resolvedBy;
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="drawer-title">
              <span className={`badge badge-${match.matchType}`}>{MATCH_TYPE_LABEL[match.matchType] || match.matchType}</span>
            </div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 6 }}>
              {REASON_LABEL[match.reasonCode] || match.reasonCode}
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">x</button>
        </div>

        {match.ledgerAIds?.length > 0 && (
          <div className="drawer-section">
            <div className="drawer-section-label">Ledger A (Internal) - {match.ledgerAIds.length} txn{match.ledgerAIds.length > 1 ? 's' : ''}</div>
            {match.ledgerAIds.map(a => (
              <div className="txn-card" key={a._id}>
                <div className="txn-card-row"><span className="txn-label">Txn ID</span><span className="mono">{a.txnId}</span></div>
                <div className="txn-card-row"><span className="txn-label">Amount</span><span className="mono">{formatAmount(a.amount)}</span></div>
                <div className="txn-card-row"><span className="txn-label">Date</span><span>{formatDate(a.date)}</span></div>
                <div className="txn-card-row"><span className="txn-label">Ref</span><span className="mono">{a.refId}</span></div>
              </div>
            ))}
          </div>
        )}

        {match.ledgerBIds?.length > 0 && (
          <div className="drawer-section">
            <div className="drawer-section-label">Ledger B (External) - {match.ledgerBIds.length} txn{match.ledgerBIds.length > 1 ? 's' : ''}</div>
            {match.ledgerBIds.map(b => (
              <div className="txn-card" key={b._id}>
                <div className="txn-card-row"><span className="txn-label">Statement ID</span><span className="mono">{b.statementId}</span></div>
                <div className="txn-card-row"><span className="txn-label">Amount</span><span className="mono">{formatAmount(b.amount)}</span></div>
                <div className="txn-card-row"><span className="txn-label">Date</span><span>{formatDate(b.date)}</span></div>
                <div className="txn-card-row"><span className="txn-label">Ref</span><span className="mono">{b.refId}</span></div>
              </div>
            ))}
          </div>
        )}

        <div className="drawer-section">
          <div className="drawer-section-label">Review</div>

          {alreadyResolved ? (
            <div className="already-resolved">
              <div style={{ marginBottom: 6 }}>
                <strong style={{ color: match.status === 'resolved' ? 'var(--status-success)' : 'var(--status-error)' }}>
                  {match.status === 'resolved' ? 'Approved' : 'Rejected'}
                </strong>
                {' '}by {getResolverDisplay(match.resolution)} on {formatDateTime(match.resolution?.resolvedAt)}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: 13 }}>"{match.resolution?.reason}"</div>
            </div>
          ) : (
            <>
              {/* Reviewer identity comes from the JWT, not a text field.
                  UI disabling is convenience only, server enforces authorization. */}
              <div style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 4, background: 'var(--bg-secondary)', fontSize: 12, color: 'var(--text-secondary)' }}>
                Reviewing as: <strong style={{ color: 'var(--text-primary)' }}>{user?.email || '-'}</strong> ({user?.role || '-'})
              </div>

              {!isChecker && (
                <div className="error-banner" style={{ marginBottom: 10 }}>
                  Only users with the checker role can approve or reject matches. Your role is {user?.role || 'unknown'}.
                </div>
              )}

              <div className="form-group">
                <label>Justification</label>
                <textarea
                  className="form-textarea"
                  placeholder="Required for the audit trail..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  disabled={!isChecker}
                />
              </div>
              {error && <div className="error-banner" style={{ marginBottom: 0, marginTop: 12 }}>{error}</div>}
              <div className="resolve-actions">
                <button className="btn-approve" disabled={submitting || !isChecker} onClick={() => handleAction('resolved')}>
                  {submitting ? 'Saving...' : 'Approve'}
                </button>
                <button className="btn-reject" disabled={submitting || !isChecker} onClick={() => handleAction('rejected')}>
                  {submitting ? 'Saving...' : 'Reject'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}