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
import { RunInfo } from '../types';

interface Props {
  runs: RunInfo[];
}

export default function RunComparisonChart({ runs }: Props) {
  const allTokens = new Set<string>();
  for (const run of runs) {
    for (const t of Object.keys(run.tokenRewardCounts)) {
      allTokens.add(t);
    }
  }

  const data = Array.from(allTokens).map((token) => ({
    token,
    [runs[0]?.label || 'Run 1']: runs[0]?.tokenRewardCounts[token] || 0,
    [runs[1]?.label || 'Run 2']: runs[1]?.tokenRewardCounts[token] || 0,
  }));

  const label1 = runs[0]?.label || 'Run 1';
  const label2 = runs[1]?.label || 'Run 2';

  return (
    <div className="chart-card">
      <h3>Rewarded Users by Token</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="token" tick={{ fill: '#aaa', fontSize: 12 }} />
          <YAxis tick={{ fill: '#aaa', fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 6 }}
            labelStyle={{ color: '#fff' }}
          />
          <Legend />
          <Bar dataKey={label1} fill="#6366f1" radius={[3, 3, 0, 0]} />
          <Bar dataKey={label2} fill="#22d3ee" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
