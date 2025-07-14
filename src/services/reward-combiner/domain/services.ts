/**
 * Service interfaces for reward combiner service
 */

import { RewardsMap, ProcessedTransfer, TransferRewardPeriod } from './types';

export interface RewardCombinerService {
  combineRewards(rewardsMaps: RewardsMap[]): RewardsMap;
}

export interface TransferProcessorService {
  processTransfers(transfers: ProcessedTransfer[]): TransferRewardPeriod[];
}

export interface RewardCalculationService {
  calculateAllRewards(): Promise<RewardsMap>;
}