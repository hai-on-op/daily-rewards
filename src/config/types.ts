export type TokenType = "RETH" | "WSTETH" | "APXETH" | "WETH" | "OP" | "TOTEM" | "STONES";
export type RewardSource = "KITE" | "OP" | "DINERO";

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
    collateralTypes: TokenType[];
  };
  haiVelo: {
    config: HaiVeloRewardConfig;
  };
} 