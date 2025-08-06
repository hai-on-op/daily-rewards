export type TokenType =
  | 'RETH'
  | 'WSTETH'
  | 'APXETH'
  | 'WETH'
  | 'OP'
  | 'TOTEM'
  | 'STONES'
  | 'HAIVELO'
  | 'ALETH'
  | 'YV-VELO-ALETH-WETH';
export type RewardSource = 'KITE' | 'OP' | 'DINERO' | 'HAI';

export interface MinterRewardConfig {
  [source: string]: {
    [token: string]: number;
  };
}

// New time-based configuration interfaces
export interface MinterRewardPeriodConfig {
  fromBlock: number;
  toBlock?: number; // undefined means "to infinity"
  config: MinterRewardConfig;
}

export interface TimedMinterRewardConfig {
  periods: MinterRewardPeriodConfig[];
}

export interface LpRewardConfig {
  [source: string]: number;
}

export interface HaiVeloRewardConfig {
  [source: string]: number;
}

export interface RewardConfig {
  minter: {
    config: MinterRewardConfig; // Legacy support
    timedConfig?: TimedMinterRewardConfig; // New time-based config
    collateralTypes: TokenType[];
  };
  lp: {
    config: LpRewardConfig;
    historicConfig: LpRewardConfig;
    collateralTypes: TokenType[];
  };
  haiVelo: {
    historicConfig: LpRewardConfig;
    config: HaiVeloRewardConfig;
  };
} 