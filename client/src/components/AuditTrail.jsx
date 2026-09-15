import { formatDateTime } from '../utils/format';

const ACTION_LABEL = {
  AUTO_MATCH: 'Auto Match',
  MANUAL_OVERRIDE: 'Manual Review',
  REJECT: 'Rejected',
  RECON_RUN_START: 'Run Started',
  RECON_RUN_COMPLETE: 'Run Complete'
};

export default function AuditTrail({ logs, loading }) {
  return (
    <div className="audit-card">
      <div className="panel-title">Audit Trail</div>

      {loading && (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 16 }}>
          Loading logs...
        </div>
      )}

      {!loading && (!logs || logs.length === 0) && (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 16 }}>
          No entries yet. Every automatic match and manual decision is logged here.
        </div>
      )}

      <div className="audit-list">
        {[...(logs || [])].reverse().slice(0, 20).map(log => {
          // actorId is populated as a User object, actorType is 'system' or 'user'
          const actorDisplay = log.actorType === 'system'
            ? 'system'
            : (typeof log.actorId === 'object' ? log.actorId?.email : log.actorId) || 'user';

          return (
            <div className="audit-entry" key={log._id}>
              <div className={`audit-action ${log.action}`}>
                {ACTION_LABEL[log.action] || log.action}
              </div>
              <div className="audit-meta">
                {actorDisplay} · {formatDateTime(log.timestamp)}
              </div>
              {log.reason && (
                <div className="audit-reason">"{log.reason}"</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}