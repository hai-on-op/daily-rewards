import { UserList } from "../types";
import { config } from "../config";
import { MinterRewardWindow } from "../config/types";
import { minterProvider } from "../utils/chain";
import { MinterStrategy } from "../core/rewards/strategies/MinterStrategy";
import { calculateStrategyRewards } from "../core/rewards/calculateRewards";
import {
  DynamicRewardCalculator,
  getDynamicTotalReward,
} from "./dynamic-reward-calculator";

type FinalResult = Record<string, Record<string, UserList>>;

async function resolveRewardAmount(
  window: MinterRewardWindow,
  rewardToken: string,
  collateralType: string,
  blockRange: { startBlock: number; endBlock: number },
  dynamicCalculator: DynamicRewardCalculator = getDynamicTotalReward
): Promise<number> {
  const configValue = window.config[rewardToken]?.[collateralType] ?? 0;

  if (!window.mode || window.mode === "fixed") {
    const totalBlocks = blockRange.endBlock - blockRange.startBlock;
    const secsInDay = 86400;
    const opBlockTime = 2;
    const blocksInDay = Math.floor(secsInDay / opBlockTime);
    const perBlockRewardAmount =
      blocksInDay > 0 ? configValue / blocksInDay : 0;
    return perBlockRewardAmount * totalBlocks;
  }

  if (window.mode === "dynamic") {
    const totalDynamic = await dynamicCalculator(rewardToken, blockRange);
    return totalDynamic * configValue;
  }

  throw new Error(`Unknown window mode: ${(window as any).mode}`);
}

/**
 * V2 implementation of minter rewards using the new RewardStrategy abstraction.
 * Produces identical results to calculateMinterRewards but uses the shared
 * TimeWeightedDistributor engine.
 */
export const calculateMinterRewardsV2 = async (
  fromBlock: number,
  toBlock?: number
): Promise<FinalResult> => {
  const minterSetupData = config().rewards.minter;

  let latestBlock: number | undefined;
  const getLatestBlock = async (): Promise<number> => {
    if (latestBlock === undefined) {
      latestBlock = await minterProvider.getBlockNumber();
    }
    return latestBlock;
  };

  const finalResult: FinalResult = {};

  for (let w = 0; w < minterSetupData.windows.length; w++) {
    const window = minterSetupData.windows[w];
    const effectiveEndBlock =
      window.endBlock ?? toBlock ?? (await getLatestBlock());

    const rewardTokens = Object.keys(window.config);

    for (const rewardToken of rewardTokens) {
      const collateralTypes = Object.keys(
        window.config[rewardToken] || {}
      );

      for (const cType of collateralTypes) {
        const startBlock = window.startBlock;
        const endBlock = effectiveEndBlock;
        const rewardAmount = await resolveRewardAmount(
          window,
          rewardToken,
          cType,
          { startBlock, endBlock }
        );

        console.log(
          `[V2] Minter: window=${w} token=${rewardToken} cType=${cType} reward=${rewardAmount.toFixed(2)}`
        );

        const strategy = new MinterStrategy(
          cType,
          minterProvider,
          config().MINTER_GEB_SUBGRAPH_URL
        );

        const earned = await calculateStrategyRewards(
          strategy,
          { startBlock, endBlock },
          rewardAmount,
          minterProvider
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
        const existing = finalResult[rewardToken][cType] || {};
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

        finalResult[rewardToken][cType] = merged;
      }
    }
  }

  return finalResult;
};
