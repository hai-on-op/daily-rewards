import { AggregatedUser } from '../types';
import { formatBoost, formatTokenAmount, formatPercent, strategyDisplayName } from '../utils/format';

interface Props {
  user: AggregatedUser;
}

export default function BoostSection({ user }: Props) {
  const boostEntries = Object.entries(user.avgBoosts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="chart-card">
      <h3>Boosts & KITE Staking</h3>
      {boostEntries.length === 0 ? (
        <div className="dim" style={{ padding: '16px 0' }}>No active boosts</div>
      ) : (
        boostEntries.map(([key, value]) => {
          const pct = Math.min(((value - 1) / 1) * 100, 100);
          const cls = value >= 1.8 ? 'high' : value >= 1.3 ? 'mid' : 'low';
          return (
            <div className="boost-row" key={key}>
              <div className="boost-label">{strategyDisplayName(key)}</div>
              <div className="boost-bar-track">
                <div className={`boost-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="boost-value">{formatBoost(value)}</div>
            </div>
          );
        })
      )}
      <div className="kite-info">
        <div>
          <span>KITE Staked:</span>
          <strong className="mono">{formatTokenAmount(user.avgKiteStaked)}</strong>
        </div>
        <div>
          <span>KITE Share:</span>
          <strong className="mono">{formatPercent(user.avgKiteShare)}</strong>
        </div>
      </div>
    </div>
  );
}
