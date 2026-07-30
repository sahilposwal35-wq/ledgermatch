import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MATCH_TYPE_LABEL } from '../utils/format';

const COLOR = {
  exact: '#3C6B49',
  fuzzy: '#A9823D',
  split: '#3C6B49',
  amount_mismatch: '#9C3B2C',
  unmatched_a: '#9C3B2C',
  unmatched_b: '#9C3B2C'
};

export default function BreakdownChart({ breakdown }) {
  const data = Object.entries(breakdown || {})
    .filter(([key]) => key !== 'duplicate')
    .map(([key, value]) => ({ key, name: MATCH_TYPE_LABEL[key] || key, value }));

  if (data.length === 0) return null;

  return (
    <div className="chart-section">
      <div className="panel-title" style={{ marginBottom: 12 }}>Match breakdown</div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={90}
            tick={{ fill: '#666F5C', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: '#F9F6EC', border: '1px solid #B9AF8D', borderRadius: 2, fontSize: 12, fontFamily: 'IBM Plex Mono' }}
            labelStyle={{ color: '#23291E' }}
            cursor={{ fill: 'rgba(35,41,30,0.04)' }}
          />
          <Bar dataKey="value" radius={[0, 0, 0, 0]} barSize={14}>
            {data.map(d => <Cell key={d.key} fill={COLOR[d.key] || '#9BA08D'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}