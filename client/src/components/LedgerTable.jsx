import { formatAmount, formatDate, MATCH_TYPE_LABEL, REASON_LABEL } from '../utils/format';

function txnSummary(match) {
  const a = match.ledgerAIds?.[0];
  const b = match.ledgerBIds?.[0];
  const amount = a?.amount ?? b?.amount;
  const date = a?.date ?? b?.date;
  const ref = a?.refId ?? b?.refId ?? '—';
  return { amount, date, ref };
}

// Small deterministic hash so each stamp gets a slightly different tilt,
// like real ink stamps never land the same way twice.
function rotationFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return (h % 7) - 3; // -3deg to +3deg
}

export default function LedgerTable({ matches, selectedId, onSelect, loading }) {
  if (loading) {
    return <div className="empty-state">Reading the ledger…</div>;
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">Nothing posted to this view</div>
        <div>Run reconciliation, or switch filters to see other entries.</div>
      </div>
    );
  }

  return (
    <div className="ledger-scroll">
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Ref</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Reason</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {matches.map(m => {
            const { amount, date, ref } = txnSummary(m);
            return (
              <tr
                key={m._id}
                className={`ledger-row ${selectedId === m._id ? 'selected' : ''}`}
                onClick={() => onSelect(m)}
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') onSelect(m); }}
              >
                <td>
                  <span
                    className={`stamp stamp-${m.matchType}`}
                    style={{ transform: `rotate(${rotationFor(m._id)}deg)` }}
                  >
                    {MATCH_TYPE_LABEL[m.matchType] || m.matchType}
                  </span>
                </td>
                <td className="mono">{ref}</td>
                <td>{formatDate(date)}</td>
                <td className="amount">₹{formatAmount(amount)}{m.amountDelta ? ` (Δ${formatAmount(m.amountDelta)})` : ''}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{REASON_LABEL[m.reasonCode] || m.reasonCode || '—'}</td>
                <td>
                  <span className={`status-dot ${m.status}`}></span>
                  {m.status.replace('_', ' ')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}