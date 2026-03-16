export interface Report {
  generatedAt: string;
  mode: string;
  runs: RunInfo[];
  summary: Summary;
  users: UserRecord[];
}

export interface RunInfo {
  label: string;
  endBlocks: Record<string, number>;
  tokenRewardCounts: Record<string, number>;
}

export interface Summary {
  totalRewardedUsers: number;
  run1: { withPosition: number; withoutPosition: number };
  run2: { withPosition: number; withoutPosition: number };
}

export interface DetailedPositions {
  minter?: {
    totalDebt: number;
    byCollateral: Record<string, number>;
  };
  haivelo?: { collateral: number };
  haiaero?: { collateral: number };
  lpStaking?: Record<string, number>;
  lp?: { liquidity: number };
  kiteStaked?: number;
  kiteShare?: number;
  boosts?: Record<string, number>;
}

export interface UserRecord {
  address: string;
  run1Rewards: Record<string, string>;
  run2Rewards: Record<string, string>;
  run1Positions: Record<string, string>;
  run2Positions: Record<string, string>;
  run1DetailedPositions?: DetailedPositions;
  run2DetailedPositions?: DetailedPositions;
  run1HasPosition: boolean;
  run2HasPosition: boolean;
}
