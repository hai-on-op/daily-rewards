/**
 * Reward calculation repository implementation
 */

import { calculateHaiveloRewardsV2 as calculateHaiveloRewards } from '../../../modules/haivelo-rewards-v2';
import { calculateLpRewardsV2 as calculateLpRewards } from '../../../modules/lp-rewards-v2';
import { calculateMinterRewardsV2 as calculateMinterRewards } from '../../../modules/minter-rewards-v2';
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
