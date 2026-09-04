import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MATCH_TYPE_LABEL } from '../utils/format';

// semantic colors to match new css
const COLOR = {
  exact: '#10B981', // status-success
  split: '#10B981',
  fuzzy: '#F59E0B', // status-warning
  amount_mismatch: '#EF4444', // status-error
  unmatched_a: '#EF4444',
  unmatched_b: '#EF4444'
};

export default function BreakdownChart({ breakdown }) {
  const data = Object.entries(breakdown || {})
    .filter(([key]) => key !== 'duplicate')
    .map(([key, value]) => ({ key, name: MATCH_TYPE_LABEL[key] || key, value }));

  if (data.length === 0) return null;

  return (
    <div className="chart-card">
      <div className="panel-title" style={{ marginBottom: 16 }}>Match Breakdown</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            tick={{ fill: '#6B7280', fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 12, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
            labelStyle={{ color: '#111827', fontWeight: 600, marginBottom: 4 }}
            cursor={{ fill: '#F9FAFB' }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
            {data.map(d => <Cell key={d.key} fill={COLOR[d.key] || '#D1D5DB'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}