import React, { useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  formatDate, formatShortDate, formatDuration, shortAddr,
  formatNumber, formatTokenAmount, formatPercent
} from '../utils/format';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

type Props = {
  data: any;
  filePath: string;
};

/**
 * Detects if JSON data is a haiAERO debug file (epoch or summary)
 */
export function isHaiaeroData(data: any, filePath: string): boolean {
  if (!data || typeof data !== 'object') return false;
  // Summary file
  if (data.generatedAt && data.epochs && data.transfers) return true;
  // Epoch debug file
  if (data.meta && data.events && (
    data.collateralEvents ||
    data.initialState ||
    filePath.includes('haiaero')
  )) return true;
  return false;
}

export function isHaiaeroSummary(data: any): boolean {
  return data?.generatedAt && data?.epochs && data?.transfers;
}

export const HaiaeroStoryView: React.FC<Props> = ({ data, filePath }) => {
  if (isHaiaeroSummary(data)) {
    return <SummaryStory data={data} />;
  }
  return <EpochStory data={data} />;
};

// ─── SUMMARY VIEW ────────────────────────────────────────────

const SummaryStory: React.FC<{ data: any }> = ({ data }) => {
  const { transfers, epochs, config: cfg } = data;

  return (
    <div className="story">
      <header className="story-header">
        <h2>haiAERO Rewards Summary</h2>
        <p className="story-subtitle">
          Generated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </header>

      <section className="story-section">
        <h3>At a Glance</h3>
        <div className="story-stats">
          <StatCard label="Total Epochs" value={epochs.length} />
          <StatCard label="Unique Users" value={data.uniqueUsers} />
          <StatCard label="Total Rewards" value={formatTokenAmount(data.totalRewardsDistributed)} unit="tokens" />
          <StatCard label="Deposit Transfers" value={transfers.length} />
        </div>
      </section>

      <section className="story-section">
        <h3>Configuration</h3>
        <div className="story-config">
          <ConfigRow label="Collateral Types" value={cfg?.HAIAERO_COLLATERAL_TYPE_IDS?.join(', ') || '-'} />
          <ConfigRow label="Block Range" value={`${formatNumber(cfg?.HAIAERO_START_BLOCK, 0)} to ${formatNumber(cfg?.HAIAERO_END_BLOCK, 0)}`} />
          <ConfigRow label="Deposit Sender" value={cfg?.HAIAERO_DEPOSIT_SENDER_ADDRESS || '-'} mono />
          <ConfigRow label="Deposit Token" value={cfg?.HAIAERO_DEPOSIT_TOKEN_ADDRESS || '-'} mono />
        </div>
      </section>

      {transfers.length > 0 && (
        <section className="story-section">
          <h3>Deposit Transfers</h3>
          <p className="story-prose">
            {transfers.length === 1
              ? 'There was 1 deposit transfer that funded the reward distribution.'
              : `There were ${transfers.length} deposit transfers that funded the reward distribution across ${epochs.length} epoch(s).`}
          </p>
          <table className="story-table">
            <thead>
              <tr><th>#</th><th>Block</th><th>Amount</th><th>Token</th></tr>
            </thead>
            <tbody>
              {transfers.map((t: any, i: number) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{formatNumber(t.blockNumber, 0)}</td>
                  <td className="mono">{formatTokenAmount(t.value)}</td>
                  <td>{t.tokenSymbol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {epochs.length > 0 && (
        <section className="story-section">
          <h3>Epochs Breakdown</h3>
          <p className="story-prose">
            Each epoch represents a reward distribution period calculated from deposit transfers.
          </p>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={epochs} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="index" tickFormatter={(v: number) => `Epoch ${v}`} />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => formatTokenAmount(value)}
                  labelFormatter={(label: number) => `Epoch ${label}`}
                />
                <Legend />
                <Bar dataKey="totalRewardsDistributed" fill="#3b82f6" name="Rewards Distributed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="usersCount" fill="#10b981" name="Users" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="story-table">
            <thead>
              <tr><th>Epoch</th><th>Blocks</th><th>Deposit</th><th>Reward Amount</th><th>Users</th><th>Distributed</th></tr>
            </thead>
            <tbody>
              {epochs.map((ep: any) => (
                <tr key={ep.index}>
                  <td>#{ep.index}</td>
                  <td>{formatNumber(ep.startBlock, 0)} - {formatNumber(ep.endBlock, 0)}</td>
                  <td className="mono">{formatTokenAmount(ep.transferValue)}</td>
                  <td className="mono">{formatTokenAmount(ep.rewardAmount)}</td>
                  <td>{ep.usersCount}</td>
                  <td className="mono">{formatTokenAmount(ep.totalRewardsDistributed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};

// ─── EPOCH DETAIL VIEW ───────────────────────────────────────

const EpochStory: React.FC<{ data: any }> = ({ data }) => {
  const { meta, initialState, collateralEvents, events } = data;

  const initEvent = events?.find((e: any) => e.type === 'init');
  const finalSnapshot = events?.find((e: any) => e.type === 'finalSnapshot');
  const earnEvents = events?.filter((e: any) => e.type === 'userEarn') || [];
  const collateralChangeEvents = events?.filter((e: any) => e.type === 'userCollateralChange') || [];
  const rewardUpdates = events?.filter((e: any) => e.type === 'updateRewardPerWeight') || [];

  const duration = initEvent ? initEvent.endTimestamp - initEvent.startTimestamp : 0;

  // Estimate the deposit block's time using Optimism's 2-second block time
  const estimatedTransferTime = useMemo(() => {
    if (!meta?.transfer?.blockNumber || !initEvent || !meta?.window?.startBlock) return null;
    const blockDiff = meta.transfer.blockNumber - meta.window.startBlock;
    return initEvent.startTimestamp + blockDiff * 2;
  }, [meta, initEvent]);

  // Build timeline chart data from rewardPerWeight updates
  const timelineData = useMemo(() => {
    if (!rewardUpdates.length) return [];
    return rewardUpdates.map((e: any) => ({
      time: e.timestamp,
      label: formatShortDate(e.timestamp),
      rewardPerWeight: e.rewardPerWeight,
      totalWeight: e.totalStakingWeight,
    }));
  }, [rewardUpdates]);

  // Build user ranking from final snapshot
  const userRanking = useMemo(() => {
    if (!finalSnapshot?.users) return [];
    return finalSnapshot.users.slice(0, 20);
  }, [finalSnapshot]);

  // Build pie chart for top earners
  const pieData = useMemo(() => {
    if (!finalSnapshot?.users) return [];
    const top5 = finalSnapshot.users.slice(0, 5);
    const othersTotal = finalSnapshot.users.slice(5).reduce((acc: number, u: any) => acc + u.earned, 0);
    const result = top5.map((u: any) => ({ name: shortAddr(u.address), value: u.earned }));
    if (othersTotal > 0) result.push({ name: 'Others', value: othersTotal });
    return result;
  }, [finalSnapshot]);

  // Build the "story" of collateral changes as a timeline
  const activityLog: Array<{ time: number; address: string; delta: number; newCollateral: number; isNew: boolean }> = useMemo(() => {
    if (!collateralChangeEvents.length) return [];
    return collateralChangeEvents.slice(0, 50).map((e: any) => ({
      time: e.timestamp as number,
      address: e.address as string,
      delta: e.deltaCollateral as number,
      newCollateral: e.collateral as number,
      isNew: e.isNewUser as boolean,
    }));
  }, [collateralChangeEvents]);

  // Cumulative reward distribution over time
  const cumulativeEarnings = useMemo(() => {
    if (!earnEvents.length) return [];
    const byTime: Record<number, number> = {};
    let cumulative = 0;
    for (const e of earnEvents) {
      cumulative += e.deltaEarned;
      byTime[e.timestamp] = cumulative;
    }
    return Object.entries(byTime).map(([ts, total]) => ({
      time: Number(ts),
      label: formatShortDate(Number(ts)),
      totalDistributed: total,
    }));
  }, [earnEvents]);

  return (
    <div className="story">
      <header className="story-header">
        <h2>
          Epoch #{meta?.epochIndex ?? '?'} - Reward Distribution
        </h2>
        {meta?.transfer && (
          <p className="story-subtitle">
            Funded by a deposit of <strong>{formatTokenAmount(meta.transfer.value)} {meta.transfer.tokenSymbol}</strong> at block {formatNumber(meta.transfer.blockNumber, 0)}
            {estimatedTransferTime && <> ({formatDate(estimatedTransferTime)})</>}
          </p>
        )}
      </header>

      {/* ── Chapter 1: The Setup ── */}
      <section className="story-section">
        <h3>The Setup</h3>
        <p className="story-prose">
          This epoch distributed{' '}
          <strong>{formatTokenAmount(meta?.rewardAmount)} tokens</strong>{' '}
          over a period of <strong>{formatDuration(duration)}</strong>
          {initEvent && (
            <>, from {formatDate(initEvent.startTimestamp)} to {formatDate(initEvent.endTimestamp)}</>
          )}.
        </p>
        {initEvent && (
          <p className="story-prose">
            The reward rate was <strong>{formatTokenAmount(initEvent.rewardRate)}</strong> tokens per second,
            starting with <strong>{initEvent.totalUsers} users</strong> and a
            total staking weight of <strong>{formatTokenAmount(initEvent.totalStakingWeight)}</strong>.
          </p>
        )}
        <div className="story-stats">
          <StatCard label="Reward Amount" value={formatTokenAmount(meta?.rewardAmount)} unit="tokens" />
          <StatCard label="Duration" value={formatDuration(duration)} />
          <StatCard label="Collateral Events" value={meta?.processingEventsCount ?? '-'} />
          <StatCard label="Collateral Types" value={meta?.collateralTypeIds?.join(', ') || '-'} />
        </div>
      </section>

      {/* ── Chapter 2: Starting Positions ── */}
      {initialState?.users?.length > 0 && (
        <section className="story-section">
          <h3>Starting Positions</h3>
          <p className="story-prose">
            Before this epoch began, <strong>{initialState.users.length} users</strong> already had collateral deposited.
            {initialState.users.length > 0 && (
              <> The largest depositor was <strong>{shortAddr(initialState.users.sort((a: any, b: any) => b.collateral - a.collateral)[0]?.address)}</strong> with{' '}
              <strong>{formatTokenAmount(initialState.users.sort((a: any, b: any) => b.collateral - a.collateral)[0]?.collateral)}</strong> collateral.</>
            )}
          </p>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            <table className="story-table">
              <thead><tr><th>User</th><th>Collateral</th><th>Weight</th></tr></thead>
              <tbody>
                {initialState.users
                  .sort((a: any, b: any) => b.collateral - a.collateral)
                  .slice(0, 15)
                  .map((u: any) => (
                    <tr key={u.address}>
                      <td className="mono">{shortAddr(u.address)}</td>
                      <td>{formatTokenAmount(u.collateral)}</td>
                      <td>{formatTokenAmount(u.stakingWeight)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Chapter 3: What Happened ── */}
      {activityLog.length > 0 && (
        <section className="story-section">
          <h3>What Happened</h3>
          <p className="story-prose">
            During this epoch, there were <strong>{collateralChangeEvents.length} collateral changes</strong>.
            {collateralChangeEvents.filter((e: any) => e.isNewUser).length > 0 && (
              <> <strong>{collateralChangeEvents.filter((e: any) => e.isNewUser).length} new users</strong> joined the pool.</>
            )}
          </p>
          <div className="activity-log">
            {activityLog.map((entry, i) => (
              <div key={i} className={`activity-item ${entry.delta > 0 ? 'deposit' : 'withdraw'}`}>
                <span className="activity-time">{formatDate(entry.time)}</span>
                <span className="activity-desc">
                  <strong>{shortAddr(entry.address)}</strong>
                  {entry.isNew && <span className="badge new">NEW</span>}
                  {entry.delta > 0 ? ' deposited ' : ' withdrew '}
                  <strong>{formatTokenAmount(Math.abs(entry.delta))}</strong>
                  {' '}&rarr; total: {formatTokenAmount(entry.newCollateral)}
                </span>
              </div>
            ))}
            {collateralChangeEvents.length > 50 && (
              <div className="activity-item muted">
                ...and {collateralChangeEvents.length - 50} more events
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Chapter 4: Reward Mechanics ── */}
      {timelineData.length > 0 && (
        <section className="story-section">
          <h3>Reward Mechanics Over Time</h3>
          <p className="story-prose">
            The chart below shows how the reward-per-weight and total staking weight changed over the epoch.
            When users deposit or withdraw collateral, the total weight changes and the reward rate per unit of weight adjusts.
          </p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(v: number) => formatShortDate(v)}
                  tick={{ fontSize: 11 }}
                />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(v: number) => formatDate(v)}
                  formatter={(value: number, name: string) => [formatTokenAmount(value), name]}
                />
                <Legend />
                <Line yAxisId="l" type="monotone" dataKey="rewardPerWeight" stroke="#3b82f6" dot={false} name="Reward/Weight" strokeWidth={2} />
                <Line yAxisId="r" type="monotone" dataKey="totalWeight" stroke="#10b981" dot={false} name="Total Weight" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── Chapter 5: Cumulative Distribution ── */}
      {cumulativeEarnings.length > 0 && (
        <section className="story-section">
          <h3>Rewards Flowing Out</h3>
          <p className="story-prose">
            This shows the cumulative amount of rewards distributed to users over time.
          </p>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulativeEarnings} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(v: number) => formatShortDate(v)}
                  tick={{ fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(v: number) => formatDate(v)}
                  formatter={(value: number) => [formatTokenAmount(value), 'Total Distributed']}
                />
                <Area type="monotone" dataKey="totalDistributed" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} name="Total Distributed" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── Chapter 6: Who Earned What ── */}
      {userRanking.length > 0 && (
        <section className="story-section">
          <h3>Who Earned What</h3>
          <p className="story-prose">
            By the end of the epoch, <strong>{formatTokenAmount(finalSnapshot?.totalRewardsDistributed)}</strong> tokens
            were distributed among <strong>{finalSnapshot?.users?.length || 0} users</strong>.
            {userRanking[0] && (
              <> The top earner was <strong>{shortAddr(userRanking[0].address)}</strong> with{' '}
              <strong>{formatTokenAmount(userRanking[0].earned)}</strong> tokens
              ({formatPercent(userRanking[0].earned / (finalSnapshot?.totalRewardsDistributed || 1))} of total).</>
            )}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Pie chart */}
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {pieData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatTokenAmount(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Ranking table */}
            <div style={{ maxHeight: 280, overflow: 'auto' }}>
              <table className="story-table">
                <thead><tr><th>#</th><th>User</th><th>Earned</th><th>Collateral</th><th>Boost</th><th>Share</th></tr></thead>
                <tbody>
                  {userRanking.map((u: any, i: number) => (
                    <tr key={u.address}>
                      <td>{i + 1}</td>
                      <td className="mono">{shortAddr(u.address)}</td>
                      <td><strong>{formatTokenAmount(u.earned)}</strong></td>
                      <td>{formatTokenAmount(u.collateral)}</td>
                      <td>{u.boost !== 1 ? `${u.boost.toFixed(2)}x` : '1x'}</td>
                      <td>{formatPercent(u.earned / (finalSnapshot?.totalRewardsDistributed || 1))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── Raw collateral events ── */}
      {collateralEvents?.length > 0 && (
        <CollapsibleSection title={`Raw Collateral Events (${collateralEvents.length})`}>
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            <table className="story-table">
              <thead><tr><th>Time</th><th>User</th><th>Delta</th><th>Block</th></tr></thead>
              <tbody>
                {collateralEvents.slice(0, 100).map((e: any, i: number) => (
                  <tr key={i}>
                    <td>{formatDate(Number(e.createdAt))}</td>
                    <td className="mono">{shortAddr(e.address)}</td>
                    <td className={e.deltaCollateral > 0 ? 'positive' : 'negative'}>
                      {e.deltaCollateral > 0 ? '+' : ''}{formatTokenAmount(e.deltaCollateral)}
                    </td>
                    <td>{e.createdAtBlock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
};

// ─── REUSABLE COMPONENTS ─────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string | number; unit?: string }> = ({ label, value, unit }) => (
  <div className="stat-card">
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}{unit && <span className="stat-unit"> {unit}</span>}</div>
  </div>
);

const ConfigRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="config-row">
    <span className="config-label">{label}</span>
    <span className={mono ? 'mono' : ''}>{value}</span>
  </div>
);

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <section className="story-section">
      <h3
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {open ? '  ' : '  '} {title}
      </h3>
      {open && children}
    </section>
  );
};
