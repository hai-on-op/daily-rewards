/**
 * Reward calculation repository implementation
 */

import { calculateHaiveloRewards } from '../../../modules/haivelo-rewards';
import { calculateLpRewards } from '../../../modules/lp-rewards';
import { calculateMinterRewards } from '../../../modules/minter-rewards';
import { RewardCalculationRepository } from '../domain/repositories';
import { UserList } from '../../../types';

export class RewardCalculationRepositoryImpl implements RewardCalculationRepository {
  async calculateHaiveloRewards(amount: number, params: { startBlock: number; endBlock: number }): Promise<{ [address: string]: { earned: number } }> {
    return await calculateHaiveloRewards(amount, params);
  }

  async calculateLpRewards(amount: number, params?: { startBlock: number; endBlock: number }): Promise<{ [address: string]: { earned: number } }> {
    return await calculateLpRewards(amount, params);
  }

  async calculateMinterRewards(startBlock: number, endBlock: number): Promise<Record<string, Record<string, UserList>>> {
    return await calculateMinterRewards(startBlock, endBlock);
  }
}