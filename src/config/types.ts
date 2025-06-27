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

export interface LpRewardConfig {
  [source: string]: number;
}

export interface HaiVeloRewardConfig {
  [source: string]: number;
}

export interface RewardConfig {
  minter: {
    config: MinterRewardConfig;
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