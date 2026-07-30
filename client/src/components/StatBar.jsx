export default function StatBar({ summary }) {
  const rate = summary?.reconciliationRate;
  const breakdown = summary?.breakdown || {};

  const cells = [
    { label: 'Exact', value: breakdown.exact || 0 },
    { label: 'Fuzzy', value: breakdown.fuzzy || 0 },
    { label: 'Split', value: breakdown.split || 0 },
    { label: 'Exceptions', value: (breakdown.amount_mismatch || 0) + (breakdown.unmatched_a || 0) + (breakdown.unmatched_b || 0) }
  ];

  return (
    <div className="stat-bar">
      <div className="stat-hero">
        <div className="stat-hero-label">Reconciliation rate</div>
        <div className={`stat-hero-value ${rate === undefined ? 'empty' : ''}`}>
          {rate !== undefined ? `${rate}%` : '—'}
        </div>
      </div>
      {cells.map(c => (
        <div className="stat-cell" key={c.label}>
          <div className="stat-cell-label">{c.label}</div>
          <div className="stat-cell-value">{c.value}</div>
        </div>
      ))}
    </div>
  );
}