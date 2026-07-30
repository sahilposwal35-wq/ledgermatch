import { formatDateTime } from '../utils/format';

const ACTION_LABEL = {
  AUTO_MATCH: 'auto match',
  MANUAL_OVERRIDE: 'manual review',
  REJECT: 'rejected',
  RECON_RUN_START: 'run started',
  RECON_RUN_COMPLETE: 'run complete'
};

export default function AuditTrail({ logs, loading }) {
  return (
    <div className="audit-panel">
      <div className="panel-title" style={{ marginBottom: 14 }}>Audit trail</div>
      {loading && <div style={{ color: 'var(--ink-faint)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>Loading…</div>}
      {!loading && (!logs || logs.length === 0) && (
        <div style={{ color: 'var(--ink-faint)', fontSize: 12 }}>
          No entries yet. Every automatic match and manual decision is logged here, append-only.
        </div>
      )}
      {[...(logs || [])].reverse().map(log => (
        <div className="audit-entry" key={log._id}>
          <span className={`audit-action ${log.action}`}>{ACTION_LABEL[log.action] || log.action}</span>
          <div className="audit-meta">{log.actor} · {formatDateTime(log.timestamp)}</div>
          {log.reason && <div className="audit-reason">"{log.reason}"</div>}
        </div>
      ))}
    </div>
  );
}