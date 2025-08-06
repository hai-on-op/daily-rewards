/**
 * Reward combiner service implementation
 */

import { RewardCombinerService } from '../domain/services';
import { RewardsMap, RewardResult } from '../domain/types';

export class RewardCombinerServiceImpl implements RewardCombinerService {
  combineRewards(rewardsMaps: RewardsMap[]): RewardsMap {
    // Get all unique reward tokens
    const allTokens = new Set<string>();

    // Collect all token types from all reward maps
    rewardsMaps.forEach(rewardsMap => {
      Object.keys(rewardsMap).forEach(token => allTokens.add(token));
    });

    const combinedRewards: RewardsMap = {};

    // Process each reward token
    for (const token of allTokens) {
      // Create a map to combine rewards by address
      const addressMap = new Map<string, number>();

      // Process each rewards map for this token
      rewardsMaps.forEach(rewardsMap => {
        const tokenRewards = rewardsMap[token] || [];

        // Add rewards
        tokenRewards.forEach(({ address, earned }) => {
          addressMap.set(address, (addressMap.get(address) || 0) + earned);
        });
      });

      // Convert map to array and sort by earned amount
      combinedRewards[token] = Array.from(addressMap.entries())
        .map(([address, earned]) => ({
          address,
          earned
        }))
        .filter(({ earned }) => earned > 0)
        .sort((a, b) => b.earned - a.earned);
    }

    return combinedRewards;
  }
} 