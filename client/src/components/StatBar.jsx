export default function StatBar({ summary }) {
  const rate = summary?.reconciliationRate;
  const breakdown = summary?.breakdown || {};

  const cells = [
    { label: 'Exact Matches', value: breakdown.exact || 0 },
    { label: 'Fuzzy Matches', value: breakdown.fuzzy || 0 },
    { label: 'Split Matches', value: breakdown.split || 0 },
    { label: 'Exceptions', value: (breakdown.amount_mismatch || 0) + (breakdown.unmatched_a || 0) + (breakdown.unmatched_b || 0) }
  ];

  return (
    <div className="metrics-grid">
      <div className="metric-card">
        <div className="metric-label">Reconciliation Rate</div>
        <div className={`metric-value ${rate !== undefined ? 'highlight' : ''}`}>
          {rate !== undefined ? `${rate}%` : '—'}
        </div>
      </div>
      {cells.map(c => (
        <div className="metric-card" key={c.label}>
          <div className="metric-label">{c.label}</div>
          <div className="metric-value">{c.value}</div>
        </div>
      ))}
    </div>
  );
}