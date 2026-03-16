import { UserList } from "../types";
import { config } from "../config";
import { lpProvider } from "../utils/chain";
import { LpStrategy } from "../core/rewards/strategies/LpStrategy";
import { calculateStrategyRewards } from "../core/rewards/calculateRewards";

type RewardCalculatorOptions = {
  startBlock: number;
  endBlock: number;
};

/**
 * V2 implementation of LP rewards using the new RewardStrategy abstraction.
 * Produces identical results to calculateLpRewards but uses the shared
 * TimeWeightedDistributor engine.
 */
export const calculateLpRewardsV2 = async (
  rewardAmount: number,
  options?: RewardCalculatorOptions
): Promise<UserList> => {
  const {
    startBlock = config().LP_START_BLOCK,
    endBlock = config().LP_END_BLOCK,
  } = options ?? {};

  console.log(
    `[V2] Calculating LP rewards from block ${startBlock} to ${endBlock}`
  );

  const strategy = new LpStrategy(lpProvider, config().LP_GEB_SUBGRAPH_URL);

  const earned = await calculateStrategyRewards(
    strategy,
    { startBlock, endBlock },
    rewardAmount,
    lpProvider
  );

  // Convert Map<string, number> to UserList for backward compatibility
  const users: UserList = {};
  for (const [address, amount] of earned) {
    if (amount > 0) {
      users[address] = {
        address,
        earned: amount,
        debt: 0,
        collateral: 0,
        lpPositions: [],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        totalBridgedTokens: 0,
        usedBridgedTokens: 0,
      };
    }
  }

  return users;
};
