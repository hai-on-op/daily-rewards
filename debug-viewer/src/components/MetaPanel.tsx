import React from 'react';

export const MetaPanel: React.FC<{ meta: any }> = ({ meta }) => {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Meta</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
        <KV k="Reward Token" v={meta?.rewardToken} />
        <KV k="Collateral" v={meta?.collateralType} />
        <KV k="Daily Reward" v={meta?.dailyRewardAmount} />
        <KV k="Reward Amount" v={meta?.rewardAmount} />
        <KV k="Total Blocks" v={meta?.totalBlocks} />
        <KV k="Window Start Block" v={meta?.window?.startBlock} />
        <KV k="Window End Block" v={meta?.window?.endBlock} />
      </div>
    </div>
  );
};

const KV: React.FC<{ k: React.ReactNode; v: React.ReactNode }> = ({ k, v }) => (
  <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8 }}>
    <div style={{ fontSize: 12, color: '#6b7280' }}>{k}</div>
    <div style={{ fontWeight: 600 }}>{String(v ?? '-') }</div>
  </div>
);


