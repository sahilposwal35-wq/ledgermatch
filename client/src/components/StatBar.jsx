export default function StatBar({ summary }) {
  const rate = summary?.reconciliationRate;
  const breakdown = summary?.breakdown || {};

  const exceptions = (breakdown.amount_mismatch || 0)
    + (breakdown.unmatched_a || 0)
    + (breakdown.unmatched_b || 0);

  const cells = [
    { label: 'Recon Rate', value: rate !== undefined ? `${rate}%` : '-', highlight: true },
    { label: 'Exact', value: breakdown.exact || 0 },
    { label: 'Fuzzy', value: breakdown.fuzzy || 0 },
    { label: 'Split', value: breakdown.split || 0 },
    { label: 'Exceptions', value: exceptions }
  ];

  return (
    <div className="metrics-grid">
      {cells.map(c => (
        <div className="metric-card" key={c.label}>
          <div className="metric-label">{c.label}</div>
          <div className={`metric-value ${c.highlight ? 'highlight' : ''}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}