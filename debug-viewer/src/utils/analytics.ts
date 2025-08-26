export type AnyEvent = {
  type: string;
  timestamp?: number;
  startTimestamp?: number;
  rewardPerWeight?: number;
  totalStakingWeight?: number;
  address?: string;
  deltaEarned?: number;
  totalEarned?: number;
  stakingWeight?: number;
  boost?: number;
  debt?: number;
  collateral?: number;
};

export type Meta = any;

export function getEventTimestamp(e: AnyEvent): number {
  return (e.timestamp ?? e.startTimestamp ?? 0) as number;
}

export function computeKPIs(meta: Meta, events: AnyEvent[]) {
  const uniqueAddresses = new Set<string>();
  let totalDeltaEarned = 0;
  let firstTs = Number.POSITIVE_INFINITY;
  let lastTs = 0;
  let countByType: Record<string, number> = {};
  for (const e of events) {
    countByType[e.type] = (countByType[e.type] ?? 0) + 1;
    const ts = getEventTimestamp(e);
    if (ts) {
      if (ts < firstTs) firstTs = ts;
      if (ts > lastTs) lastTs = ts;
    }
    if (e.address) uniqueAddresses.add(e.address.toLowerCase());
    if (typeof e.deltaEarned === 'number') totalDeltaEarned += e.deltaEarned;
  }
  const rewardAmount = meta?.rewardAmount ?? null;
  const deltaVsMeta = typeof rewardAmount === 'number' ? totalDeltaEarned - rewardAmount : null;
  return {
    uniqueAddresses: uniqueAddresses.size,
    totalEvents: events.length,
    totalDeltaEarned,
    rewardAmount,
    deltaVsMeta,
    firstTs: isFinite(firstTs) ? firstTs : null,
    lastTs: lastTs || null,
    countByType
  };
}

export function buildSeries(events: AnyEvent[]) {
  const points: Array<{ ts: number; rewardPerWeight: number | null; totalStakingWeight: number | null }> = [];
  let lastRpw: number | null = null;
  let lastTsw: number | null = null;
  for (const e of events) {
    const ts = getEventTimestamp(e);
    if (e.type === 'updateRewardPerWeight') {
      lastRpw = e.rewardPerWeight ?? lastRpw;
      lastTsw = e.totalStakingWeight ?? lastTsw;
    }
    if (e.type === 'userEarn' || e.type === 'userWeightChange') {
      lastTsw = e.totalStakingWeight ?? lastTsw;
    }
    points.push({ ts, rewardPerWeight: lastRpw, totalStakingWeight: lastTsw });
  }
  // derivative approximated on neighbor diffs
  const derivative: Array<{ ts: number; dRewardPerWeight: number | null }> = points.map((p, i) => {
    if (i === 0) return { ts: p.ts, dRewardPerWeight: null };
    const prev = points[i - 1];
    if (p.rewardPerWeight == null || prev.rewardPerWeight == null) return { ts: p.ts, dRewardPerWeight: null };
    const dt = Math.max(1, p.ts - prev.ts);
    return { ts: p.ts, dRewardPerWeight: (p.rewardPerWeight - prev.rewardPerWeight) / dt };
  });
  return { points, derivative };
}

export function listAddresses(events: AnyEvent[]): string[] {
  const set = new Set<string>();
  for (const e of events) if (e.address) set.add(e.address.toLowerCase());
  return Array.from(set).sort();
}

export type Snapshot = {
  ts: number;
  rewardPerWeight: number | null;
  totalStakingWeight: number | null;
  addressCount: number;
  topWeights: Array<{ address: string; stakingWeight: number; boost?: number; totalEarned?: number }>; // top 5
  allWeights: Array<{ address: string; stakingWeight: number; boost?: number; totalEarned?: number }>; // all addresses, sorted
};

export function computeSnapshotAt(events: AnyEvent[], targetTs: number): Snapshot {
  let rewardPerWeight: number | null = null;
  let totalStakingWeight: number | null = null;
  const addressState = new Map<string, { stakingWeight: number; boost?: number; totalEarned?: number }>();

  for (const e of events) {
    const ts = getEventTimestamp(e);
    if (ts > targetTs) break;
    if (e.type === 'updateRewardPerWeight') {
      if (typeof e.rewardPerWeight === 'number') rewardPerWeight = e.rewardPerWeight;
      if (typeof e.totalStakingWeight === 'number') totalStakingWeight = e.totalStakingWeight;
    }
    if (e.address) {
      const addr = e.address.toLowerCase();
      const current = addressState.get(addr) ?? { stakingWeight: 0 };
      if (typeof e.stakingWeight === 'number') current.stakingWeight = e.stakingWeight;
      if (typeof e.boost === 'number') current.boost = e.boost;
      if (typeof e.totalEarned === 'number') current.totalEarned = e.totalEarned;
      addressState.set(addr, current);
    }
  }

  const sortedWeights = Array.from(addressState.entries())
    .map(([address, s]) => ({ address, ...s }))
    .sort((a, b) => (b.stakingWeight || 0) - (a.stakingWeight || 0));
  const topWeights = sortedWeights.slice(0, 5);

  return {
    ts: targetTs,
    rewardPerWeight,
    totalStakingWeight,
    addressCount: addressState.size,
    topWeights,
    allWeights: sortedWeights
  };
}

export function anomalies(meta: Meta, events: AnyEvent[]) {
  const issues: Array<{ ts?: number; type: string; message: string }> = [];
  const kpis = computeKPIs(meta, events);
  if (typeof kpis.deltaVsMeta === 'number' && Math.abs(kpis.deltaVsMeta) > 1e-6) {
    issues.push({ type: 'reward_mismatch', message: `Sum(deltaEarned) - rewardAmount = ${kpis.deltaVsMeta}` });
  }

  // detect large weight jumps
  let prevWeight: number | null = null;
  for (const e of events) {
    const ts = getEventTimestamp(e);
    if (typeof e.totalStakingWeight === 'number') {
      if (prevWeight != null) {
        const delta = Math.abs(e.totalStakingWeight - prevWeight);
        if (delta > Math.max(1, (prevWeight || 1) * 0.25)) {
          issues.push({ ts, type: 'weight_spike', message: `Large totalStakingWeight change: Δ=${delta.toFixed(4)}` });
        }
      }
      prevWeight = e.totalStakingWeight;
    }
  }

  // user earn while rewardPerWeight is constant over time (approx)
  let lastRpw: number | null = null;
  for (const e of events) {
    const ts = getEventTimestamp(e);
    if (e.type === 'updateRewardPerWeight' && typeof e.rewardPerWeight === 'number') {
      lastRpw = e.rewardPerWeight;
    }
    if (e.type === 'userEarn' && typeof e.deltaEarned === 'number') {
      if (typeof e.rewardPerWeight === 'number' && lastRpw != null) {
        const diff = Math.abs(e.rewardPerWeight - lastRpw);
        if (diff < 1e-12 && e.deltaEarned > 0) {
          issues.push({ ts, type: 'earn_flat_rpw', message: `Earning while rewardPerWeight unchanged: +${e.deltaEarned}` });
        }
      }
    }
  }

  // timestamp regressions
  let prevTs = -Infinity;
  for (const e of events) {
    const ts = getEventTimestamp(e);
    if (ts < prevTs) issues.push({ ts, type: 'timestamp_regression', message: `Timestamp decreased from ${prevTs} to ${ts}` });
    prevTs = ts;
  }

  return issues;
}

export function extractAddressSeries(events: AnyEvent[], address: string) {
  const addr = address.toLowerCase();
  const rows: Array<{ ts: number; deltaEarned: number | null; totalEarned: number | null; stakingWeight: number | null; boost: number | null }> = [];
  for (const e of events) {
    const ts = getEventTimestamp(e);
    if (e.address && e.address.toLowerCase() === addr) {
      rows.push({
        ts,
        deltaEarned: typeof e.deltaEarned === 'number' ? e.deltaEarned : null,
        totalEarned: typeof e.totalEarned === 'number' ? e.totalEarned : null,
        stakingWeight: typeof e.stakingWeight === 'number' ? e.stakingWeight : null,
        boost: typeof e.boost === 'number' ? e.boost : null,
      });
    }
  }
  return rows;
}


