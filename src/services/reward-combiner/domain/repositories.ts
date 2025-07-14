/**
 * Repository interfaces for reward combiner service
 */

import { ProcessedTransfer } from './types';

export interface TransferRepository {
  getProcessedTransfers(): Promise<ProcessedTransfer[]>;
}

import { UserList } from '../../../types';

export interface RewardCalculationRepository {
  calculateHaiveloRewards(amount: number, params: { startBlock: number; endBlock: number }): Promise<{ [address: string]: { earned: number } }>;
  calculateLpRewards(amount: number, params?: { startBlock: number; endBlock: number }): Promise<{ [address: string]: { earned: number } }>;
  calculateMinterRewards(startBlock: number, endBlock: number): Promise<Record<string, Record<string, UserList>>>;
}