import { useState } from 'react';
import { DailyRewardReport } from '../../types';
import { compareUser } from '../../utils/compareReports';
import { formatTokenAmount, formatPercent, formatBoost, formatDelta, formatPctChange, strategyDisplayName } from '../../utils/format';
import DeltaCard from './DeltaCard';

interface Props {
  reportA: DailyRewardReport;
  reportB: DailyRewardReport;
}

export default function UserComparisonSearch({ reportA, reportB }: Props) {
  const [input, setInput] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = () => {
    setError(null);
    setAddress(null);
    if (!input) return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(input)) {
      setError('Invalid address format.');
      return;
    }
    const addr = input.toLowerCase();
    const comp = compareUser(reportA, reportB, addr);
    if (!comp) {
      setError('Address not found in either report.');
      return;
    }
    setAddress(addr);
  };

  const comparison = address ? compareUser(reportA, reportB, address) : null;

  return (
    <div className="compare-section">
      <div className="section-title">User-Level Comparison</div>

      <div className="address-search">
        <input
          className="address-input"
          placeholder="0x..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="search-btn" onClick={handleSearch}>Compare</button>
      </div>
      {error && <div className="address-error">{error}</div>}

      {comparison && address && (
        <>
          {(!comparison.inA || !comparison.inB) && (
            <div className="warning-box" style={{ marginBottom: 16 }}>
              {!comparison.inA && <span>This user only appears in Report B (new user).</span>}
              {!comparison.inB && <span>This user only appears in Report A (departed user).</span>}
            </div>
          )}

          <div className="cards-grid" style={{ marginBottom: 16 }}>
            {Object.entries(comparison.earnedByToken).map(([token, d]) => (
              <DeltaCard
                key={token}
                label={`Avg Daily ${token}`}
                delta={d}
                formatter={formatTokenAmount}
                colorClass={token === 'HAI' ? 'cyan' : 'green'}
              />
            ))}
            <DeltaCard label="Days Active" delta={comparison.daysActive} formatter={(n) => String(Math.round(n))} colorClass="accent" />
            <DeltaCard label="KITE Staked" delta={comparison.kiteStaked} formatter={formatTokenAmount} />
            <DeltaCard label="KITE Share" delta={comparison.kiteShare} formatter={formatPercent} />
          </div>

          <div className="chart-card" style={{ marginBottom: 16 }}>
            <h3>Strategy Earnings</h3>
            <table className="compare-user-strategies">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th style={{ textAlign: 'right' }}>Token</th>
                  <th style={{ textAlign: 'right' }}>Earned (A)</th>
                  <th style={{ textAlign: 'right' }}>Earned (B)</th>
                  <th style={{ textAlign: 'right' }}>Change</th>
                  <th style={{ textAlign: 'right' }}>Share (A)</th>
                  <th style={{ textAlign: 'right' }}>Share (B)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(comparison.strategyEarned).map(([strat, tokens]) =>
                  Object.entries(tokens).map(([token, d]) => {
                    const share = comparison.strategyShare[strat]?.[token];
                    const cls = d.diff > 0 ? 'delta-positive' : d.diff < 0 ? 'delta-negative' : 'delta-neutral';
                    return (
                      <tr key={`${strat}-${token}`}>
                        <td>{strategyDisplayName(strat)}</td>
                        <td style={{ textAlign: 'right' }}>{token}</td>
                        <td style={{ textAlign: 'right' }}>{formatTokenAmount(d.valueA)}</td>
                        <td style={{ textAlign: 'right' }}>{formatTokenAmount(d.valueB)}</td>
                        <td className={cls} style={{ textAlign: 'right' }}>{formatDelta(d.diff)}</td>
                        <td style={{ textAlign: 'right' }}>{share ? formatPercent(share.valueA) : '-'}</td>
                        <td style={{ textAlign: 'right' }}>{share ? formatPercent(share.valueB) : '-'}</td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>

          <div className="chart-card">
            <h3>Boost Comparison</h3>
            <table className="compare-user-strategies">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th style={{ textAlign: 'right' }}>Boost (A)</th>
                  <th style={{ textAlign: 'right' }}>Boost (B)</th>
                  <th style={{ textAlign: 'right' }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(comparison.boosts).map(([key, d]) => {
                  const cls = d.diff > 0 ? 'delta-positive' : d.diff < 0 ? 'delta-negative' : 'delta-neutral';
                  return (
                    <tr key={key}>
                      <td>{strategyDisplayName(key)}</td>
                      <td style={{ textAlign: 'right' }}>{formatBoost(d.valueA)}</td>
                      <td style={{ textAlign: 'right' }}>{formatBoost(d.valueB)}</td>
                      <td className={cls} style={{ textAlign: 'right' }}>
                        {d.diff > 0 ? '+' : ''}{d.diff.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
