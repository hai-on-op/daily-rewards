/**
 * Service for processing rewards data
 */

import { ethers } from 'ethers';
import { config } from '../../config';
import { createClaimedAmountsUseCases } from '../claimed-amounts/factory';

export interface UserReward {
  address: string;
  earned: number;
}

export interface ProcessedReward {
  address: string;
  earned: string; // BigNumber as string
}

export interface RewardResults {
  [token: string]: UserReward[];
}

export interface ProcessedRewardResults {
  [token: string]: ProcessedReward[];
}

export interface TokenAddressMap {
  KITE: string;
  OP: string;
  DINERO: string;
  HAI: string;
}

/**
 * Converts earned values to BigNumber with 18 decimals
 * @param results - Raw reward results
 * @returns Processed rewards with BigNumber earned values
 */
export function convertRewardsToBigNumber(results: RewardResults): ProcessedRewardResults {
  return Object.entries(results)
    .map(([token, userRewards]) => {
      return {
        [token]: userRewards.map((reward) => {
          console.log(reward.earned);

          return {
            address: reward.address,
            earned: ethers.utils
              .parseEther(reward.earned.toFixed(18))
              .toString(),
          };
        }),
      };
    })
    .reduce((acc, curr) => ({ ...acc, ...curr }), {});
}

/**
 * Gets the token address map from configuration
 * @returns Map of token names to addresses
 */
export function getTokenAddressMap(): TokenAddressMap {
  const cfg = config();
  return {
    KITE: cfg.KITE_ADDRESS,
    OP: cfg.OP_ADDRESS,
    DINERO: cfg.DINERO_ADDRESS,
    HAI: cfg.HAI_ADDRESS,
  };
}

/**
 * Processes rewards by subtracting claimed amounts
 * @param adjustedResults - Rewards converted to BigNumber format
 * @returns Final rewards after filtering out claimed amounts
 */
export async function processRewardsWithClaimedAmounts(
  adjustedResults: ProcessedRewardResults
): Promise<ProcessedRewardResults> {
  const claimedAmountsUseCases = createClaimedAmountsUseCases();
  const tokenAddressMap = getTokenAddressMap();
  const finalResults: ProcessedRewardResults = {};

  for (const [token, rewards] of Object.entries(adjustedResults)) {
    console.log(`Processing claims for token: ${token}`);

    const tokenAddress = tokenAddressMap[token.toUpperCase() as keyof TokenAddressMap];

    // Process rewards with claimed amounts using the new layered architecture
    finalResults[token] = await claimedAmountsUseCases.processRewardsWithClaimedAmounts(
      tokenAddress,
      rewards
    );

    console.log(
      `Processed ${rewards.length} rewards for ${token}, ${finalResults[token].length} remain after filtering`
    );
  }

  return finalResults;
}

/**
 * Main function to process all rewards from raw data to final results
 * @param rawResults - Raw reward results from data sources
 * @returns Final processed rewards ready for merkle tree generation
 */
export async function processAllRewards(rawResults: RewardResults): Promise<ProcessedRewardResults> {
  console.log('Processing rewards...');
  
  // Convert earned values to BigNumber with 18 decimals
  const adjustedResults = convertRewardsToBigNumber(rawResults);
  
  // Process rewards with claimed amounts
  const finalResults = await processRewardsWithClaimedAmounts(adjustedResults);
  
  console.log('Rewards processing completed');
  return finalResults;
} 