import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { UserRecord } from '../types';
import { shortAddr, formatTokenAmount } from '../utils/format';
import { userRewardDelta } from '../utils/derive';

interface Props {
  user: UserRecord;
  tokens: string[];
  onClose: () => void;
}

export default function UserDetailModal({ user, tokens, onClose }: Props) {
  const delta = userRewardDelta(user);

  const chartData = tokens
    .filter((t) => user.run1Rewards[t] || user.run2Rewards[t])
    .map((t) => ({
      token: t,
      'Run 1': parseFloat(user.run1Rewards[t] || '0'),
      'Run 2': parseFloat(user.run2Rewards[t] || '0'),
    }));

  const isFlagged = !user.run1HasPosition || !user.run2HasPosition;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        <h2>
          <span className={`status-dot ${isFlagged ? 'red' : 'green'}`} />
          <span className="mono">{shortAddr(user.address)}</span>
        </h2>
        <p className="mono dim full-addr">{user.address}</p>

        {/* Positions comparison */}
        <div className="detail-grid">
          <div className="detail-section">
            <h4>Run 1 Positions</h4>
            {Object.keys(user.run1Positions).length === 0 ? (
              <p className="dim">No positions</p>
            ) : (
              <ul className="position-list">
                {Object.entries(user.run1Positions).map(([type, val]) => (
                  <li key={type}>
                    <strong>{type}</strong>: {val}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="detail-section">
            <h4>Run 2 Positions</h4>
            {Object.keys(user.run2Positions).length === 0 ? (
              <p className="dim">No positions</p>
            ) : (
              <ul className="position-list">
                {Object.entries(user.run2Positions).map(([type, val]) => (
                  <li key={type}>
                    <strong>{type}</strong>: {val}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Rewards table */}
        <h4>Rewards Comparison</h4>
        <table className="detail-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Run 1</th>
              <th>Run 2</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {tokens
              .filter((t) => user.run1Rewards[t] || user.run2Rewards[t])
              .map((t) => {
                const d = delta[t] || 0;
                return (
                  <tr key={t}>
                    <td>{t}</td>
                    <td className="mono right">
                      {formatTokenAmount(parseFloat(user.run1Rewards[t] || '0'))}
                    </td>
                    <td className="mono right">
                      {formatTokenAmount(parseFloat(user.run2Rewards[t] || '0'))}
                    </td>
                    <td className={`mono right ${d > 0 ? 'positive' : d < 0 ? 'negative' : ''}`}>
                      {d > 0 ? '+' : ''}
                      {formatTokenAmount(d)}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="detail-chart">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="token" tick={{ fill: '#aaa', fontSize: 11 }} />
                <YAxis tick={{ fill: '#aaa', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: '#1a1a2e',
                    border: '1px solid #333',
                    borderRadius: 6,
                  }}
                />
                <Legend />
                <Bar dataKey="Run 1" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Run 2" fill="#22d3ee" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
