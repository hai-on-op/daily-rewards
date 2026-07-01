import { DailyRewardReport } from '../types';

export interface DeltaValue {
  valueA: number;
  valueB: number;
  diff: number;
  pctChange: number;
}

export interface ProtocolHealthDelta {
  rewardsByToken: Record<string, DeltaValue>;
  boostedPositions: DeltaValue;
  userCount: DeltaValue;
  daysWithData: DeltaValue;
}

export interface StrategyDelta {
  strategy: string;
  token: string;
  avgA: number;
  avgB: number;
  diff: number;
  pctChange: number;
}

export interface UserDelta {
  address: string;
  earnedA: number;
  earnedB: number;
  diff: number;
}

export interface UserComparison {
  earnedByToken: Record<string, DeltaValue>;
  strategyEarned: Record<string, Record<string, DeltaValue>>;
  strategyShare: Record<string, Record<string, DeltaValue>>;
  boosts: Record<string, DeltaValue>;
  kiteStaked: DeltaValue;
  kiteShare: DeltaValue;
  daysActive: DeltaValue;
  inA: boolean;
  inB: boolean;
}

export function delta(a: number, b: number): DeltaValue {
  const diff = b - a;
  const pctChange = a !== 0 ? diff / Math.abs(a) : b !== 0 ? Infinity : 0;
  return { valueA: a, valueB: b, diff, pctChange };
}

export function compareProtocolHealth(a: DailyRewardReport, b: DailyRewardReport): ProtocolHealthDelta {
  const tokens = new Set([
    ...Object.keys(a.globalAverages.avgDailyRewardByToken),
    ...Object.keys(b.globalAverages.avgDailyRewardByToken),
  ]);

  const rewardsByToken: Record<string, DeltaValue> = {};
  for (const token of tokens) {
    rewardsByToken[token] = delta(
      a.globalAverages.avgDailyRewardByToken[token] || 0,
      b.globalAverages.avgDailyRewardByToken[token] || 0,
    );
  }

  return {
    rewardsByToken,
    boostedPositions: delta(a.globalAverages.avgBoostedPositions, b.globalAverages.avgBoostedPositions),
    userCount: delta(a.users.length, b.users.length),
    daysWithData: delta(a.totalDaysWithData, b.totalDaysWithData),
  };
}

export function compareUserSets(a: DailyRewardReport, b: DailyRewardReport) {
  const setA = new Set(a.users.map((u) => u.address.toLowerCase()));
  const setB = new Set(b.users.map((u) => u.address.toLowerCase()));

  const newUsers = [...setB].filter((addr) => !setA.has(addr));
  const departedUsers = [...setA].filter((addr) => !setB.has(addr));
  const commonUsers = [...setA].filter((addr) => setB.has(addr));

  return { newUsers, departedUsers, commonUsers, countA: setA.size, countB: setB.size };
}

export function compareStrategies(a: DailyRewardReport, b: DailyRewardReport): StrategyDelta[] {
  const aggregate = (totals: { strategy: string; token: string; avgDailyTotal: number }[]) => {
    const map = new Map<string, { strategy: string; token: string; total: number }>();
    for (const s of totals) {
      const key = `${s.strategy}|${s.token}`;
      const existing = map.get(key);
      if (existing) existing.total += s.avgDailyTotal;
      else map.set(key, { strategy: s.strategy, token: s.token, total: s.avgDailyTotal });
    }
    return map;
  };

  const mapA = aggregate(a.globalAverages.avgDailyStrategyTotals);
  const mapB = aggregate(b.globalAverages.avgDailyStrategyTotals);
  const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);

  const results: StrategyDelta[] = [];
  for (const key of allKeys) {
    const entryA = mapA.get(key);
    const entryB = mapB.get(key);
    const avgA = entryA?.total || 0;
    const avgB = entryB?.total || 0;
    const diff = avgB - avgA;
    const pctChange = avgA !== 0 ? diff / Math.abs(avgA) : avgB !== 0 ? Infinity : 0;
    results.push({
      strategy: (entryA || entryB)!.strategy,
      token: (entryA || entryB)!.token,
      avgA,
      avgB,
      diff,
      pctChange,
    });
  }

  return results.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
}

export function computeTopMovers(
  a: DailyRewardReport,
  b: DailyRewardReport,
  token: string,
  limit = 10,
): { gainers: UserDelta[]; losers: UserDelta[] } {
  const mapA = new Map(a.users.map((u) => [u.address.toLowerCase(), u]));
  const mapB = new Map(b.users.map((u) => [u.address.toLowerCase(), u]));
  const allAddrs = new Set([...mapA.keys(), ...mapB.keys()]);

  const deltas: UserDelta[] = [];
  for (const addr of allAddrs) {
    const earnedA = mapA.get(addr)?.avgDailyEarnedByToken[token] || 0;
    const earnedB = mapB.get(addr)?.avgDailyEarnedByToken[token] || 0;
    if (earnedA === 0 && earnedB === 0) continue;
    deltas.push({ address: addr, earnedA, earnedB, diff: earnedB - earnedA });
  }

  deltas.sort((x, y) => y.diff - x.diff);

  return {
    gainers: deltas.filter((d) => d.diff > 0).slice(0, limit),
    losers: deltas.filter((d) => d.diff < 0).sort((x, y) => x.diff - y.diff).slice(0, limit),
  };
}

export function compareUser(
  a: DailyRewardReport,
  b: DailyRewardReport,
  address: string,
): UserComparison | null {
  const addr = address.toLowerCase();
  const userA = a.users.find((u) => u.address.toLowerCase() === addr);
  const userB = b.users.find((u) => u.address.toLowerCase() === addr);

  if (!userA && !userB) return null;

  const tokens = new Set([
    ...Object.keys(userA?.avgDailyEarnedByToken || {}),
    ...Object.keys(userB?.avgDailyEarnedByToken || {}),
  ]);
  const earnedByToken: Record<string, DeltaValue> = {};
  for (const t of tokens) {
    earnedByToken[t] = delta(
      userA?.avgDailyEarnedByToken[t] || 0,
      userB?.avgDailyEarnedByToken[t] || 0,
    );
  }

  const stratKeys = new Set([
    ...Object.keys(userA?.avgDailyStrategyEarned || {}),
    ...Object.keys(userB?.avgDailyStrategyEarned || {}),
  ]);
  const strategyEarned: Record<string, Record<string, DeltaValue>> = {};
  const strategyShare: Record<string, Record<string, DeltaValue>> = {};
  for (const strat of stratKeys) {
    const tokensInStrat = new Set([
      ...Object.keys(userA?.avgDailyStrategyEarned[strat] || {}),
      ...Object.keys(userB?.avgDailyStrategyEarned[strat] || {}),
    ]);
    strategyEarned[strat] = {};
    strategyShare[strat] = {};
    for (const t of tokensInStrat) {
      strategyEarned[strat][t] = delta(
        userA?.avgDailyStrategyEarned[strat]?.[t] || 0,
        userB?.avgDailyStrategyEarned[strat]?.[t] || 0,
      );
      strategyShare[strat][t] = delta(
        userA?.avgDailyStrategyShare[strat]?.[t] || 0,
        userB?.avgDailyStrategyShare[strat]?.[t] || 0,
      );
    }
  }

  const boostKeys = new Set([
    ...Object.keys(userA?.avgBoosts || {}),
    ...Object.keys(userB?.avgBoosts || {}),
  ]);
  const boosts: Record<string, DeltaValue> = {};
  for (const k of boostKeys) {
    boosts[k] = delta(userA?.avgBoosts[k] || 1, userB?.avgBoosts[k] || 1);
  }

  return {
    earnedByToken,
    strategyEarned,
    strategyShare,
    boosts,
    kiteStaked: delta(userA?.avgKiteStaked || 0, userB?.avgKiteStaked || 0),
    kiteShare: delta(userA?.avgKiteShare || 0, userB?.avgKiteShare || 0),
    daysActive: delta(userA?.daysActive || 0, userB?.daysActive || 0),
    inA: !!userA,
    inB: !!userB,
  };
}
