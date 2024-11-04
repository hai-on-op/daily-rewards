export type TokenType = "RETH" | "WSTETH" | "APXETH" | "WETH" | "OP";
export type RewardSource = "KITE" | "OP";

export interface MinterRewardConfig {
  [source: string]: {
    [token: string]: number;
  };
}

export interface LpRewardConfig {
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
} 