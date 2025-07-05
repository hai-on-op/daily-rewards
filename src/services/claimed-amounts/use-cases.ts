/**
 * Use cases for claimed amounts functionality
 */

import { ethers } from 'ethers';
import { ClaimedAmountsService } from './claimed-amounts-service';

export interface UserReward {
  address: string;
  earned: string;
}

export interface ProcessedReward {
  address: string;
  earned: string;
}

export class ClaimedAmountsUseCases {
  constructor(private readonly claimedAmountsService: ClaimedAmountsService) {}

  /**
   * Processes rewards by subtracting claimed amounts and filtering out dust amounts
   * @param token - The token address
   * @param rewards - Array of user rewards
   * @returns Promise that resolves to processed rewards
   */
  async processRewardsWithClaimedAmounts(
    token: string,
    rewards: UserReward[]
  ): Promise<ProcessedReward[]> {
    if (rewards.length === 0) {
      return [];
    }

    // Get claimed amounts for all users
    const userAddresses = rewards.map(reward => reward.address);
    const claimedAmountsMap = await this.claimedAmountsService.getClaimedAmountsMap(token, userAddresses);

    // Process each reward
    const processedRewards = rewards
      .map(reward => {
        const claimed = claimedAmountsMap[reward.address.toLowerCase()] || '0';
        const remaining = ethers.BigNumber.from(reward.earned).sub(
          ethers.BigNumber.from(claimed)
        );

        // Filter out dust amounts (less than 0.01 tokens)
        const isDusty = remaining.lte(
          ethers.BigNumber.from(10).pow(16) // 0.01 * 10^18
        );

        return {
          address: reward.address,
          earned: isDusty ? '0' : remaining.toString()
        };
      })
      .filter(reward => reward.earned !== '0');

    return processedRewards;
  }

  /**
   * Gets the total claimed amount for a token across all users
   * @param token - The token address
   * @param users - Array of user addresses
   * @returns Promise that resolves to the total claimed amount
   */
  async getTotalClaimedAmount(token: string, users: string[]): Promise<string> {
    const claimedAmountsMap = await this.claimedAmountsService.getClaimedAmountsMap(token, users);

    const totalClaimed = Object.values(claimedAmountsMap)
      .reduce((total, amount) => {
        return total.add(ethers.BigNumber.from(amount));
      }, ethers.BigNumber.from(0));

    return totalClaimed.toString();
  }
}