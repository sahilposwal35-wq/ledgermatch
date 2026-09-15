import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MATCH_TYPE_LABEL } from '../utils/format';

const COLOR = {
  exact:          '#16a34a',
  split:          '#0d9488',
  fuzzy:          '#d97706',
  amount_mismatch:'#dc2626',
  unmatched_a:    '#9f1239',
  unmatched_b:    '#b45309'
};

const RADIAN = Math.PI / 180;

function CustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.05) return null; // skip tiny slices
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function BreakdownChart({ breakdown }) {
  const data = Object.entries(breakdown || {})
    .filter(([key, value]) => key !== 'duplicate' && value > 0)
    .map(([key, value]) => ({ key, name: MATCH_TYPE_LABEL[key] || key, value }));

  if (data.length === 0) return null;

  return (
    <div className="chart-card">
      <div className="panel-title" style={{ marginBottom: 12 }}>Match Breakdown</div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            labelLine={false}
            label={CustomLabel}
          >
            {data.map(d => (
              <Cell key={d.key} fill={COLOR[d.key] || '#94a3b8'} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#fff',
              border: '1px solid var(--border-light)',
              borderRadius: 4,
              fontSize: 12
            }}
            formatter={(value, name) => [value, name]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}