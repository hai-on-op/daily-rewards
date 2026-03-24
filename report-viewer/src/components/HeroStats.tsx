import { AggregatedUser } from '../types';
import { formatTokenAmount, formatPercent, formatBoost } from '../utils/format';

interface Props {
  user: AggregatedUser;
}

export default function HeroStats({ user }: Props) {
  const boostValues = Object.values(user.avgBoosts).filter((b) => b > 1);
  const avgBoost = boostValues.length > 0
    ? boostValues.reduce((s, v) => s + v, 0) / boostValues.length
    : 1;

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="section-title">Your 30-Day Averages</div>
      <div className="cards-grid">
        {Object.entries(user.avgDailyEarnedByToken).map(([token, avg]) => (
          <div className="stat-card" key={token}>
            <div className={`stat-value ${token === 'HAI' ? 'cyan' : 'green'}`}>
              {formatTokenAmount(avg)}
            </div>
            <div className="stat-label">Avg Daily {token}</div>
          </div>
        ))}
        <div className="stat-card">
          <div className="stat-value accent">{user.daysActive}<span className="dim small"> / 30</span></div>
          <div className="stat-label">Days Active</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${avgBoost >= 1.5 ? 'green' : avgBoost >= 1.2 ? 'amber' : ''}`}>
            {formatBoost(avgBoost)}
          </div>
          <div className="stat-label">Avg Boost</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatTokenAmount(user.avgKiteStaked)}</div>
          <div className="stat-label">Avg KITE Staked</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatPercent(user.avgKiteShare)}</div>
          <div className="stat-label">Avg KITE Share</div>
        </div>
      </div>
    </div>
  );
}
