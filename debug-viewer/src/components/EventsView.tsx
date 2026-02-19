import React, { useMemo, useState } from 'react';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatDate, formatShortDate, shortAddr, formatTokenAmount } from '../utils/format';

type Event = any;

export const EventsView: React.FC<{ events: Event[] }> = ({ events }) => {
  const [filter, setFilter] = useState<string>('all');

  // Derive available event types from data
  const eventTypes = useMemo(() => {
    const types = new Set<string>();
    events.forEach(e => types.add(e.type));
    return Array.from(types).sort();
  }, [events]);

  const filtered = useMemo(() => {
    return filter === 'all' ? events : events.filter((e) => e.type === filter);
  }, [events, filter]);

  const chartData = useMemo(() => {
    const series: any[] = [];
    let rewardPerWeight = 0;
    for (const e of events) {
      if (e.type === 'updateRewardPerWeight') {
        rewardPerWeight = e.rewardPerWeight;
      }
      const ts = e.timestamp ?? e.startTimestamp ?? 0;
      series.push({
        ts,
        rewardPerWeight,
        totalStakingWeight: e.totalStakingWeight ?? null,
        userEarn: e.type === 'userEarn' ? e.deltaEarned : null,
      });
    }
    return series.slice(0, 2000);
  }, [events]);

  const pageSize = 200;
  const [page, setPage] = useState(0);
  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const pageItems = filtered.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div>
      <div className="controls">
        <strong>Events</strong>
        <select value={filter} onChange={(e) => { setPage(0); setFilter(e.target.value); }}>
          <option value="all">All ({events.length})</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{t} ({events.filter(e => e.type === t).length})</option>
          ))}
        </select>
        <span>Showing {pageItems.length} of {filtered.length}</span>
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Prev</button>
        <button onClick={() => setPage((p) => Math.min(maxPage, p + 1))} disabled={page >= maxPage}>Next</button>
      </div>

      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="ts" tickFormatter={(v: number) => formatShortDate(v)} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="l" />
            <YAxis yAxisId="r" orientation="right" />
            <Tooltip
              labelFormatter={(v: number) => formatDate(v)}
              formatter={(value: number, name: string) => [formatTokenAmount(value), name]}
            />
            <Legend />
            <Line yAxisId="l" type="monotone" dataKey="rewardPerWeight" stroke="#3b82f6" dot={false} name="Reward/Weight" />
            <Line yAxisId="r" type="monotone" dataKey="totalStakingWeight" stroke="#22c55e" dot={false} name="Total Weight" />
            <Line yAxisId="r" type="monotone" dataKey="userEarn" stroke="#ef4444" dot={false} name="User Earn (delta)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Type</th>
            <th>Time</th>
            <th>Address</th>
            <th>Delta Earned</th>
            <th>Total Earned</th>
            <th>Reward/Weight</th>
            <th>Total Weight</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((e, i) => {
            const ts = e.timestamp ?? e.startTimestamp ?? 0;
            return (
              <tr key={i}>
                <td>{page * pageSize + i + 1}</td>
                <td>{e.type}</td>
                <td>{ts ? formatDate(ts) : ''}</td>
                <td className="mono">{e.address ? shortAddr(e.address) : ''}</td>
                <td>{e.deltaEarned != null ? formatTokenAmount(e.deltaEarned) : ''}</td>
                <td>{e.totalEarned != null ? formatTokenAmount(e.totalEarned) : ''}</td>
                <td>{e.rewardPerWeight != null ? formatTokenAmount(e.rewardPerWeight) : ''}</td>
                <td>{e.totalStakingWeight != null ? formatTokenAmount(e.totalStakingWeight) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
