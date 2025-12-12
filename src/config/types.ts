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

export interface MinterRewardWindow {
  startBlock: number;
  endBlock?: number;
  config: MinterRewardConfig;
}

export interface LpRewardConfig {
  [source: string]: number;
}

export interface HaiVeloRewardConfig {
  [source: string]: number;
}

// LP Staking reward types (HaiBoldCurveLPStaking and HaiVeloVeloLPStaking)
export type LpStakingType = 'HAI_BOLD_CURVE' | 'HAI_VELO_VELO';

export interface LpStakingRewardConfig {
  [source: string]: {
    [stakingType: string]: number;
  };
}

export interface LpStakingRewardWindow {
  startBlock: number;
  endBlock?: number;
  config: LpStakingRewardConfig;
}

export interface RewardConfig {
  minter: {
    config: MinterRewardConfig;
    collateralTypes: TokenType[];
    windows: MinterRewardWindow[];
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
  lpStaking: {
    config: LpStakingRewardConfig;
    stakingTypes: LpStakingType[];
    windows: LpStakingRewardWindow[];
  };
} 