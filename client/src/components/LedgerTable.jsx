import { formatAmount, formatDate, MATCH_TYPE_LABEL, REASON_LABEL } from '../utils/format';

function txnSummary(match) {
  const a = match.ledgerAIds?.[0];
  const b = match.ledgerBIds?.[0];
  const amount = a?.amount ?? b?.amount;
  const date = a?.date ?? b?.date;
  const ref = a?.refId ?? b?.refId ?? '—';
  return { amount, date, ref };
}

export default function LedgerTable({ matches, selectedId, onSelect, loading }) {
  if (loading) {
    return <div className="empty-state">Loading records…</div>;
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No records found</div>
        <div>Run reconciliation or adjust your filters.</div>
      </div>
    );
  }

  return (
    <table className="ledger-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Reference ID</th>
          <th>Date</th>
          <th className="right">Amount</th>
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
                <span className={`badge badge-${m.matchType}`}>
                  {MATCH_TYPE_LABEL[m.matchType] || m.matchType}
                </span>
              </td>
              <td className="mono">{ref}</td>
              <td>{formatDate(date)}</td>
              <td className="amount right">₹{formatAmount(amount)}{m.amountDelta ? ` (Δ${formatAmount(m.amountDelta)})` : ''}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{REASON_LABEL[m.reasonCode] || m.reasonCode || '—'}</td>
              <td>
                <span className={`status-dot ${m.status}`}></span>
                {m.status.replace('_', ' ')}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}