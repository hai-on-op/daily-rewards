import { StrategyEvent } from "../interfaces/IRewardStrategy";

// --- HaiAero ---

export interface HaiAeroUserState {
  address: string;
  collateral: number;
}

export interface HaiAeroEvent extends StrategyEvent {
  address: string;
  deltaCollateral: number;
}

// --- Minter (future) ---

export interface MinterUserState {
  address: string;
  debt: number;
  collateral: number;
  totalBridgedTokens: number;
  usedBridgedTokens: number;
  cType: string;
}

// --- LP (future) ---

export interface LpUserState {
  address: string;
  debt: number;
  lpPositions: Array<{
    lowerTick: number;
    upperTick: number;
    liquidity: number;
    tokenId: number;
  }>;
}

// --- HaiVelo (future) ---

export interface HaiVeloUserState {
  address: string;
  collateral: number;
  lpStakedRaw: number;
}

// --- LP Staking ---

export interface LpStakingUserState {
  address: string;
  lpStaked: number;
}

export interface LpStakingEvent extends StrategyEvent {
  address: string;
  deltaAmount: number;
}
