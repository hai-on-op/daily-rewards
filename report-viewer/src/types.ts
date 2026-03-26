export interface DailyRewardReport {
  generatedAt: string;
  periodDays: number;
  totalDaysWithData: number;
  globalAverages: GlobalAverages;
  dailyReports: DayReport[];
  users: AggregatedUser[];
}

export interface GlobalAverages {
  avgDailyRewardByToken: Record<string, number>;
  avgBoostedPositions: number;
  avgDailyStrategyTotals: StrategyAvgTotal[];
}

export interface StrategyAvgTotal {
  strategy: string;
  token: string;
  avgDailyTotal: number;
}

export interface DayReport {
  dayTimestamp: number;
  date: string;
  strategyTotals: DayStrategyTotal[];
  totalRewardByToken: Record<string, number>;
  totalBoostedPositions: number;
  users: Record<string, DayUserEntry>;
}

export interface DayStrategyTotal {
  strategy: string;
  token: string;
  totalReward: number;
}

export interface StrategyPositionData {
  /** Time-weighted avg boosted weight for this day */
  avgWeight: number;
  /** Time-weighted avg unboosted weight for this day */
  avgUnboostedWeight: number;
  /** Time-weighted avg total boosted weight for this day */
  avgTotalWeight: number;
  /** Time-weighted avg total unboosted weight for this day */
  avgTotalUnboostedWeight: number;
  /** Time-weighted avg position in real units (debt, collateral, LP staked) */
  avgPosition: number;
  /** Time-weighted avg total position across all users (real units) */
  avgTotalPosition: number;
  /** Point-in-time weight at end of day */
  endOfDayWeight: number;
  /** Point-in-time boost at end of day */
  endOfDayBoost: number;
  /** True if this reward is based on a delayed position (~7 days ago) */
  isDelayed: boolean;
}

export interface DayUserEntry {
  dailyEarned: Record<string, number>;
  dailyStrategyEarned: Record<string, Record<string, number>>;
  dailyStrategyShare: Record<string, Record<string, number>>;
  strategyPositions: Record<string, Record<string, StrategyPositionData>>;
  kiteStaked: number;
  kiteShare: number;
  boosts: Record<string, number>;
  hasBoostedPosition: boolean;
}

export interface AggregatedUser {
  address: string;
  avgDailyEarnedByToken: Record<string, number>;
  avgDailyStrategyEarned: Record<string, Record<string, number>>;
  avgDailyStrategyShare: Record<string, Record<string, number>>;
  avgKiteStaked: number;
  avgKiteShare: number;
  avgBoosts: Record<string, number>;
  daysActive: number;
}
