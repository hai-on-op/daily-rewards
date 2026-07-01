import { AggregatedUser } from '../types';
import { formatTokenAmount, formatPercent, strategyDisplayName } from '../utils/format';

interface Props {
  user: AggregatedUser;
}

export default function StrategyBreakdown({ user }: Props) {
  const rows: { strategy: string; token: string; earned: number; share: number }[] = [];

  for (const [strategy, tokens] of Object.entries(user.avgDailyStrategyEarned)) {
    for (const [token, earned] of Object.entries(tokens)) {
      const share = user.avgDailyStrategyShare?.[strategy]?.[token] || 0;
      rows.push({ strategy, token, earned, share });
    }
  }

  return (
    <div className="chart-card">
      <h3>Strategy Breakdown (Avg Daily)</h3>
      <table className="detail-table">
        <thead>
          <tr>
            <th>Strategy</th>
            <th style={{ textAlign: 'right' }}>Token</th>
            <th style={{ textAlign: 'right' }}>Avg Earned</th>
            <th style={{ textAlign: 'right' }}>Pool Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{strategyDisplayName(r.strategy)}</td>
              <td style={{ textAlign: 'right' }}>{r.token}</td>
              <td style={{ textAlign: 'right' }} className="mono">{formatTokenAmount(r.earned)}</td>
              <td style={{ textAlign: 'right' }} className="mono">{formatPercent(r.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
