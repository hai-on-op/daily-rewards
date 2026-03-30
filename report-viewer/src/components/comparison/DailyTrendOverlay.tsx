import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { DailyRewardReport } from '../../types';
import { formatDateShort, formatTokenAmount } from '../../utils/format';

interface Props {
  reportA: DailyRewardReport;
  reportB: DailyRewardReport;
}

export default function DailyTrendOverlay({ reportA, reportB }: Props) {
  const dateMap = new Map<string, {
    haiA?: number; haiB?: number;
    kiteA?: number; kiteB?: number;
    boostedA?: number; boostedB?: number;
  }>();

  for (const day of reportA.dailyReports) {
    const entry = dateMap.get(day.date) || {};
    entry.haiA = day.totalRewardByToken.HAI || 0;
    entry.kiteA = day.totalRewardByToken.KITE || 0;
    entry.boostedA = day.totalBoostedPositions;
    dateMap.set(day.date, entry);
  }

  for (const day of reportB.dailyReports) {
    const entry = dateMap.get(day.date) || {};
    entry.haiB = day.totalRewardByToken.HAI || 0;
    entry.kiteB = day.totalRewardByToken.KITE || 0;
    entry.boostedB = day.totalBoostedPositions;
    dateMap.set(day.date, entry);
  }

  const sortedDates = [...dateMap.keys()].sort();
  const chartData = sortedDates.map((date) => ({
    date: formatDateShort(date),
    ...dateMap.get(date),
  }));

  return (
    <div className="compare-section">
      <div className="section-title">Daily Trend Overlay</div>

      <div className="chart-card" style={{ marginBottom: 16 }}>
        <h3>Daily HAI Rewards</h3>
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
            <Line type="monotone" dataKey="haiA" name="HAI (A)" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="haiB" name="HAI (B)" stroke="#22d3ee" strokeWidth={2} dot={false} strokeDasharray="5 5" connectNulls={false} opacity={0.6} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card" style={{ marginBottom: 16 }}>
        <h3>Daily KITE Rewards</h3>
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
            <Line type="monotone" dataKey="kiteA" name="KITE (A)" stroke="#10b981" strokeWidth={2} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="kiteB" name="KITE (B)" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="5 5" connectNulls={false} opacity={0.6} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3>Boosted Positions</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,42,62,0.5)" />
            <XAxis dataKey="date" tick={{ fill: '#777', fontSize: 11 }} />
            <YAxis tick={{ fill: '#777', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 6 }}
            />
            <Legend />
            <Line type="monotone" dataKey="boostedA" name="Boosted (A)" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="boostedB" name="Boosted (B)" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 5" connectNulls={false} opacity={0.6} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
