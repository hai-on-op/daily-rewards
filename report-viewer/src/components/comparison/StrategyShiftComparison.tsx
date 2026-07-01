import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { DailyRewardReport } from '../../types';
import { compareStrategies } from '../../utils/compareReports';
import { formatTokenAmount, formatDelta, formatPctChange, strategyDisplayName } from '../../utils/format';

interface Props {
  reportA: DailyRewardReport;
  reportB: DailyRewardReport;
}

export default function StrategyShiftComparison({ reportA, reportB }: Props) {
  const strategies = compareStrategies(reportA, reportB);

  const chartData = strategies.map((s) => ({
    name: `${strategyDisplayName(s.strategy)} (${s.token})`,
    'Report A': s.avgA,
    'Report B': s.avgB,
  }));

  return (
    <div className="compare-section">
      <div className="section-title">Strategy Shifts</div>

      <div className="chart-card" style={{ marginBottom: 16 }}>
        <h3>Avg Daily Rewards by Strategy</h3>
        <ResponsiveContainer width="100%" height={Math.max(200, strategies.length * 50)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 120 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,42,62,0.5)" />
            <XAxis type="number" tick={{ fill: '#777', fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#999', fontSize: 11 }} width={110} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 6 }}
              formatter={(value: number) => formatTokenAmount(value)}
            />
            <Legend />
            <Bar dataKey="Report A" fill="#22d3ee" barSize={14} />
            <Bar dataKey="Report B" fill="#6366f1" barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3>Detail</h3>
        <table className="detail-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th style={{ textAlign: 'right' }}>Token</th>
              <th style={{ textAlign: 'right' }}>Report A</th>
              <th style={{ textAlign: 'right' }}>Report B</th>
              <th style={{ textAlign: 'right' }}>Change</th>
              <th style={{ textAlign: 'right' }}>%</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((s, i) => {
              const cls = s.diff > 0 ? 'delta-positive' : s.diff < 0 ? 'delta-negative' : 'delta-neutral';
              return (
                <tr key={i}>
                  <td>{strategyDisplayName(s.strategy)}</td>
                  <td style={{ textAlign: 'right' }}>{s.token}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatTokenAmount(s.avgA)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatTokenAmount(s.avgB)}</td>
                  <td className={`mono ${cls}`} style={{ textAlign: 'right' }}>{formatDelta(s.diff)}</td>
                  <td className={`mono ${cls}`} style={{ textAlign: 'right' }}>
                    {isFinite(s.pctChange) ? formatPctChange(s.pctChange) : 'new'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
