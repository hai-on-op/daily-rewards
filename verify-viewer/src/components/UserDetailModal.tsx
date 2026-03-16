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
import PositionBreakdown from './PositionBreakdown';

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

  // Boost comparison chart data
  const r1Boosts = user.run1DetailedPositions?.boosts || {};
  const r2Boosts = user.run2DetailedPositions?.boosts || {};
  const allBoostKeys = Array.from(
    new Set([...Object.keys(r1Boosts), ...Object.keys(r2Boosts)])
  );
  const boostChartData = allBoostKeys.map((k) => ({
    strategy: k.replace('lpStaking_', 'LP: '),
    'Run 1': r1Boosts[k] || 1,
    'Run 2': r2Boosts[k] || 1,
  }));

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
            <PositionBreakdown
              positions={user.run1DetailedPositions}
              fallbackPositions={user.run1Positions}
              label="Run 1"
            />
          </div>
          <div className="detail-section">
            <h4>Run 2 Positions</h4>
            <PositionBreakdown
              positions={user.run2DetailedPositions}
              fallbackPositions={user.run2Positions}
              label="Run 2"
            />
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

        {/* Rewards chart */}
        {chartData.length > 0 && (
          <div className="detail-chart">
            <h4>Rewards</h4>
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

        {/* Boost comparison chart */}
        {boostChartData.length > 0 && (
          <div className="detail-chart">
            <h4>Boost Multipliers</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={boostChartData} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="strategy" tick={{ fill: '#aaa', fontSize: 11 }} />
                <YAxis domain={[0.8, 2.2]} tick={{ fill: '#aaa', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: '#1a1a2e',
                    border: '1px solid #333',
                    borderRadius: 6,
                  }}
                  formatter={(value: number) => value.toFixed(3) + 'x'}
                />
                <Legend />
                <Bar dataKey="Run 1" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Run 2" fill="#34d399" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
