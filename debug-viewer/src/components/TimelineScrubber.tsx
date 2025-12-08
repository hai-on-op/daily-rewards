import React, { useMemo, useState } from 'react';
import { computeSnapshotAt, getEventTimestamp } from '../utils/analytics';

export const TimelineScrubber: React.FC<{
  events: any[];
}> = ({ events }) => {
  const timestamps = useMemo(() => events.map(getEventTimestamp).filter(Boolean), [events]);
  const minTs = useMemo(() => (timestamps.length ? Math.min(...timestamps) : 0), [timestamps]);
  const maxTs = useMemo(() => (timestamps.length ? Math.max(...timestamps) : 0), [timestamps]);
  const [ts, setTs] = useState<number>(minTs);

  const snap = useMemo(() => computeSnapshotAt(events, ts), [events, ts]);

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Timeline</h3>
      <div className="controls">
        <input type="range" min={minTs} max={maxTs} value={ts} onChange={(e) => setTs(Number(e.target.value))} style={{ width: 300 }} />
        <span>ts={ts}</span>
        <button onClick={() => setTs(minTs)} disabled={!timestamps.length}>Start</button>
        <button onClick={() => setTs(maxTs)} disabled={!timestamps.length}>End</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        <KV k="Reward/Weight" v={snap.rewardPerWeight} />
        <KV k="Total Weight" v={snap.totalStakingWeight} />
        <KV k="Active Addresses" v={snap.addressCount} />
      </div>
      <div style={{ marginTop: 8 }}>
        <strong>Address weights</strong>
        <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, padding: 8 }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Address</th>
                <th>Weight</th>
                <th>Boost</th>
                <th>Total Earned</th>
              </tr>
            </thead>
            <tbody>
              {snap.allWeights.map((t) => (
                <tr key={t.address}>
                  <td>{t.address}</td>
                  <td>{fmt(t.stakingWeight)}</td>
                  <td>{fmt(t.boost)}</td>
                  <td>{fmt(t.totalEarned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const KV: React.FC<{ k: React.ReactNode; v: any }> = ({ k, v }) => (
  <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8 }}>
    <div style={{ fontSize: 12, color: '#6b7280' }}>{k}</div>
    <div style={{ fontWeight: 600 }}>{fmt(v)}</div>
  </div>
);

function fmt(v: any) {
  if (v == null) return '-';
  if (typeof v === 'number') return Number(v.toFixed(6));
  return String(v);
}


