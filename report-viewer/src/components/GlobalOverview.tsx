import { DailyRewardReport } from '../types';
import { formatTokenAmount, formatNumber, strategyDisplayName } from '../utils/format';

interface Props {
  report: DailyRewardReport;
}

export default function GlobalOverview({ report }: Props) {
  const { globalAverages, users, totalDaysWithData } = report;

  // Aggregate duplicate strategy entries (e.g. two lpStaking KITE entries)
  const stratMap = new Map<string, { strategy: string; token: string; total: number }>();
  for (const s of globalAverages.avgDailyStrategyTotals) {
    const key = `${s.strategy}|${s.token}`;
    const existing = stratMap.get(key);
    if (existing) existing.total += s.avgDailyTotal;
    else stratMap.set(key, { strategy: s.strategy, token: s.token, total: s.avgDailyTotal });
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div className="section-title">Protocol Overview</div>
      <div className="cards-grid">
        {Object.entries(globalAverages.avgDailyRewardByToken).map(([token, avg]) => (
          <div className="stat-card" key={token}>
            <div className={`stat-value ${token === 'HAI' ? 'cyan' : 'green'}`}>
              {formatTokenAmount(avg)}
            </div>
            <div className="stat-label">Avg Daily {token}</div>
          </div>
        ))}
        <div className="stat-card">
          <div className="stat-value">{users.length}</div>
          <div className="stat-label">Rewarded Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatNumber(globalAverages.avgBoostedPositions, 1)}</div>
          <div className="stat-label">Avg Boosted Positions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value accent">{totalDaysWithData}</div>
          <div className="stat-label">Days in Report</div>
        </div>
      </div>

      <div className="chart-card">
        <h3>Strategy Distribution (Avg Daily)</h3>
        <table className="detail-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th style={{ textAlign: 'right' }}>Token</th>
              <th style={{ textAlign: 'right' }}>Avg Daily Total</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(stratMap.values()).map((s, i) => (
              <tr key={i}>
                <td>{strategyDisplayName(s.strategy)}</td>
                <td style={{ textAlign: 'right' }}>{s.token}</td>
                <td style={{ textAlign: 'right' }} className="mono">{formatTokenAmount(s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
