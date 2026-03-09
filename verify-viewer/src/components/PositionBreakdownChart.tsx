import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  positionTypes: { name: string; count: number }[];
}

const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

export default function PositionBreakdownChart({ positionTypes }: Props) {
  return (
    <div className="chart-card">
      <h3>Position Type Distribution</h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={positionTypes}
            dataKey="count"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={100}
            paddingAngle={2}
            label={({ name, percent }) =>
              `${name} (${(percent * 100).toFixed(0)}%)`
            }
            labelLine={{ stroke: '#666' }}
          >
            {positionTypes.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 6 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
