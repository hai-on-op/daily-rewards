import { UserList } from "../types";
import { config } from "../config";
import { LpStakingType } from "../config/types";
import { lpStakingProvider } from "../utils/chain";
import { LpStakingStrategy } from "../core/rewards/strategies/LpStakingStrategy";
import { calculateStrategyRewards } from "../core/rewards/calculateRewards";

type FinalResult = Record<string, Record<string, UserList>>;

/**
 * V2 implementation of LP staking rewards using the new RewardStrategy abstraction.
 * Produces identical results to calculateLpStakingRewards but uses the shared
 * TimeWeightedDistributor engine.
 */
export const calculateLpStakingRewardsV2 = async (
  fromBlock: number,
  toBlock?: number
): Promise<FinalResult> => {
  const lpStakingSetupData = config().rewards.lpStaking;

  // Fetch latest block from RPC if toBlock is not provided
  let latestBlock: number | undefined;
  const getLatestBlock = async (): Promise<number> => {
    if (latestBlock === undefined) {
      latestBlock = await lpStakingProvider.getBlockNumber();
    }
    return latestBlock;
  };

  const finalResult: FinalResult = {};

  for (let w = 0; w < lpStakingSetupData.windows.length; w++) {
    const window = lpStakingSetupData.windows[w];
    const effectiveEndBlock =
      window.endBlock ?? toBlock ?? (await getLatestBlock());

    const rewardTokens = Object.keys(window.config);

    for (const rewardToken of rewardTokens) {
      const stakingTypes = Object.keys(
        window.config[rewardToken] || {}
      ) as LpStakingType[];

      for (const stakingType of stakingTypes) {
        const startBlock = window.startBlock;
        const endBlock = effectiveEndBlock;
        const dailyRewardAmount =
          window.config[rewardToken][stakingType] ?? 0;

        // Calculate total rewards for the window based on block time
        const totalBlocks = endBlock - startBlock;
        const secsInDay = 86400;
        const opBlockTime = 2;
        const blocksInDay = Math.floor(secsInDay / opBlockTime);
        const perBlockRewardAmount =
          blocksInDay > 0 ? dailyRewardAmount / blocksInDay : 0;
        const rewardAmount = perBlockRewardAmount * totalBlocks;

        console.log(`[V2] LP Staking: window=${w} token=${rewardToken} type=${stakingType} reward=${rewardAmount.toFixed(2)}`);

        const strategy = new LpStakingStrategy(stakingType, lpStakingProvider);

        const earned = await calculateStrategyRewards(
          strategy,
          { startBlock, endBlock },
          rewardAmount,
          lpStakingProvider
        );

        // Convert Map<string, number> → UserList
        const usersListWithRewards: UserList = {};
        for (const [address, amount] of earned) {
          if (amount > 0) {
            usersListWithRewards[address] = {
              address,
              earned: amount,
              collateral: 0,
              debt: 0,
              lpPositions: [],
              stakingWeight: 0,
              rewardPerWeightStored: 0,
              totalBridgedTokens: 0,
              usedBridgedTokens: 0,
            };
          }
        }

        // Initialize result structure
        if (!finalResult[rewardToken]) {
          finalResult[rewardToken] = {};
        }

        // Merge results across windows
        const existing = finalResult[rewardToken][stakingType] || {};
        const merged: UserList = { ...existing } as UserList;

        Object.entries(usersListWithRewards).forEach(([address, value]) => {
          if (!merged[address]) {
            merged[address] = { ...value } as any;
          } else {
            merged[address] = {
              ...merged[address],
              earned:
                (merged[address].earned || 0) + (value.earned || 0),
            } as any;
          }
        });

        finalResult[rewardToken][stakingType] = merged;
      }
    }
  }

  return finalResult;
};
