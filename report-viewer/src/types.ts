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
  weight: number;
  boost: number;
  totalWeight: number;
  totalUnboostedWeight: number;
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
