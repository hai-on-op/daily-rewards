import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { DayUserEntry } from '../types';
import { formatDateShort, formatTokenAmount } from '../utils/format';

interface DailyDataEntry {
  date: string;
  userEntry: DayUserEntry;
}

interface Props {
  dailyData: DailyDataEntry[];
}

export default function EarningsChart({ dailyData }: Props) {
  const chartData = dailyData.map((d) => ({
    date: formatDateShort(d.date),
    HAI: d.userEntry.dailyEarned.HAI || 0,
    KITE: d.userEntry.dailyEarned.KITE || 0,
  }));

  return (
    <div className="chart-card" style={{ marginBottom: 20 }}>
      <h3>Daily Earnings (30 Days)</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,42,62,0.5)" />
          <XAxis dataKey="date" tick={{ fill: '#777', fontSize: 11 }} />
          <YAxis tick={{ fill: '#777', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 6 }}
            formatter={(value: number, name: string) => [formatTokenAmount(value), name]}
          />
          <Legend />
          <Line type="monotone" dataKey="HAI" stroke="#22d3ee" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="KITE" stroke="#10b981" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
