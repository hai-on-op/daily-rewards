import React, { useMemo } from 'react';
import { buildSeries, getEventTimestamp } from '../utils/analytics';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceDot } from 'recharts';
import { formatShortDate, formatDate, formatTokenAmount } from '../utils/format';

export const MechanicsChart: React.FC<{ events: any[] }> = ({ events }) => {
  const { points, derivative } = useMemo(() => buildSeries(events), [events]);
  const annotations = useMemo(() => events.filter((e) => e.type === 'updateRewardPerWeight').slice(0, 50), [events]);
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Reward mechanics</h3>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="ts" tickFormatter={(v: number) => formatShortDate(v)} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="l" />
            <YAxis yAxisId="r" orientation="right" />
            <Tooltip
              labelFormatter={(v: number) => formatDate(v)}
              formatter={(value: number, name: string) => [formatTokenAmount(value), name]}
            />
            <Legend />
            <Line yAxisId="l" type="monotone" dataKey="rewardPerWeight" stroke="#1d4ed8" dot={false} name="Reward/Weight" />
            <Line yAxisId="r" type="monotone" dataKey="totalStakingWeight" stroke="#059669" dot={false} name="Total Weight" />
            {annotations.map((e: any, i: number) => (
              <ReferenceDot key={i} x={getEventTimestamp(e)} yAxisId="l" y={points.find(p => p.ts >= getEventTimestamp(e))?.rewardPerWeight ?? 0} r={3} fill="#f59e0b" stroke="none" ifOverflow="extendDomain" />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
