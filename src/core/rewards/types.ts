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

// --- Minter ---

export interface MinterUserState {
  address: string;
  debt: number;
  collateral: number;
  totalBridgedTokens: number;
}

export type MinterEventType = "DELTA_DEBT" | "UPDATE_ACCUMULATED_RATE";

export interface MinterEvent extends StrategyEvent {
  eventType: MinterEventType;
  address?: string;
  deltaDebt?: number;
  complementaryValue?: number;
  rateMultiplier?: number;
  cType?: string;
  createdAtBlock?: number;
  logIndex?: number;
}

// --- LP ---

export interface LpPosition {
  tokenId: number;
  lowerTick: number;
  upperTick: number;
  liquidity: number;
}

export interface LpUserState {
  address: string;
  debt: number;
  lpPositions: LpPosition[];
}

export type LpEventType =
  | "DELTA_DEBT"
  | "POOL_POSITION_UPDATE"
  | "POOL_SWAP"
  | "UPDATE_ACCUMULATED_RATE";

export interface LpEvent extends StrategyEvent {
  eventType: LpEventType;
  address?: string;
  deltaDebt?: number;
  cType?: string;
  position?: LpPosition;
  sqrtPrice?: number | string;
  rateMultiplier?: number;
  logIndex?: number;
}

// --- HaiVelo ---

export interface HaiVeloUserState {
  address: string;
  collateral: number;
  lpStakedRaw: number;
}

export type HaiVeloEventType = "COLLATERAL" | "LP_STAKING" | "PRICE_UPDATE";

export interface HaiVeloEvent extends StrategyEvent {
  eventType: HaiVeloEventType;
  address?: string;
  deltaCollateral?: number;
  deltaLpAmount?: number;
  haiVeloPerLp?: number;
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
