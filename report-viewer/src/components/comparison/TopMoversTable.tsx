import { useState, useMemo } from 'react';
import { DailyRewardReport } from '../../types';
import { computeTopMovers } from '../../utils/compareReports';
import { shortAddr, formatTokenAmount, formatDelta } from '../../utils/format';

interface Props {
  reportA: DailyRewardReport;
  reportB: DailyRewardReport;
}

export default function TopMoversTable({ reportA, reportB }: Props) {
  const [token, setToken] = useState('HAI');

  const { gainers, losers } = useMemo(
    () => computeTopMovers(reportA, reportB, token),
    [reportA, reportB, token],
  );

  return (
    <div className="compare-section">
      <div className="section-title">Top Movers</div>

      <div className="token-toggle">
        {['HAI', 'KITE'].map((t) => (
          <button
            key={t}
            className={`token-toggle-btn ${token === t ? 'active' : ''}`}
            onClick={() => setToken(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="movers-grid">
        <div className="chart-card">
          <h3 style={{ color: 'var(--green)' }}>Biggest Gainers</h3>
          {gainers.length === 0 ? (
            <div className="dim small" style={{ padding: '12px 0' }}>No gainers</div>
          ) : (
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th style={{ textAlign: 'right' }}>A</th>
                  <th style={{ textAlign: 'right' }}>B</th>
                  <th style={{ textAlign: 'right' }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {gainers.map((u) => (
                  <tr key={u.address}>
                    <td className="mono">{shortAddr(u.address)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{formatTokenAmount(u.earnedA)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{formatTokenAmount(u.earnedB)}</td>
                    <td className="mono delta-positive" style={{ textAlign: 'right' }}>{formatDelta(u.diff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="chart-card">
          <h3 style={{ color: 'var(--red)' }}>Biggest Losers</h3>
          {losers.length === 0 ? (
            <div className="dim small" style={{ padding: '12px 0' }}>No losers</div>
          ) : (
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th style={{ textAlign: 'right' }}>A</th>
                  <th style={{ textAlign: 'right' }}>B</th>
                  <th style={{ textAlign: 'right' }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {losers.map((u) => (
                  <tr key={u.address}>
                    <td className="mono">{shortAddr(u.address)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{formatTokenAmount(u.earnedA)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{formatTokenAmount(u.earnedB)}</td>
                    <td className="mono delta-negative" style={{ textAlign: 'right' }}>{formatDelta(u.diff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
