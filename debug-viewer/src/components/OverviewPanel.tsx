import React from 'react';
import { computeKPIs } from '../utils/analytics';

export const OverviewPanel: React.FC<{ meta: any; events: any[] }> = ({ meta, events }) => {
  const kpis = computeKPIs(meta, events);
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Overview</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <KV k="Reward Token" v={meta?.rewardToken} />
        <KV k="Collateral" v={meta?.collateralType} />
        <KV k="Blocks" v={`${meta?.window?.startBlock} → ${meta?.window?.endBlock}`} />
        <KV k="Reward Amount" v={fmt(meta?.rewardAmount)} />
        <KV k="Total Events" v={kpis.totalEvents} />
        <KV k="Unique Addresses" v={kpis.uniqueAddresses} />
        <KV k="Σ deltaEarned" v={fmt(kpis.totalDeltaEarned)} />
        <KV k="Δ vs meta" v={fmt(kpis.deltaVsMeta)} highlight={kpis.deltaVsMeta && Math.abs(kpis.deltaVsMeta) > 1e-6} />
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
        Events by type: {Object.entries(kpis.countByType).map(([t, c]) => `${t}: ${c}`).join('  |  ')}
      </div>
    </div>
  );
};

function fmt(v: any) {
  if (v == null) return '-';
  if (typeof v === 'number') return Number(v.toFixed(6));
  return String(v);
}

const KV: React.FC<{ k: React.ReactNode; v: React.ReactNode; highlight?: boolean }> = ({ k, v, highlight }) => (
  <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, background: highlight ? '#fff7ed' : undefined }}>
    <div style={{ fontSize: 12, color: '#6b7280' }}>{k}</div>
    <div style={{ fontWeight: 600 }}>{String(v ?? '-') }</div>
  </div>
);


