/**
 * Domain types for reward combiner service
 */

export interface RewardResult {
  address: string;
  earned: number;
}

export interface RewardsMap {
  [token: string]: RewardResult[];
}

export interface ProcessedTransfer {
  blockNumber: number;
  value: number;
  tokenSymbol: string;
}

export interface RewardCalculationParams {
  startBlock: number;
  endBlock: number;
  amount?: number;
}

export interface RewardCalculationResult {
  [address: string]: { earned: number };
}

export interface TransferRewardPeriod {
  startBlock: number;
  endBlock: number;
  rewardAmount: number;
  tokenSymbol: string;
}

export enum RewardType {
  HAIVELO_HISTORICAL = 'HAIVELO_HISTORICAL',
  HAIVELO_DAILY = 'HAIVELO_DAILY',
  LP_HISTORICAL = 'LP_HISTORICAL',
  LP_CURRENT = 'LP_CURRENT',
  MINTER = 'MINTER'
}

export interface RewardCalculationRequest {
  type: RewardType;
  params: RewardCalculationParams;
  config?: any;
} 