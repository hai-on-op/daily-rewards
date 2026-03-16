import { UserList } from "../types";
import { config } from "../config";
import { haiveloProvider } from "../utils/chain";
import { HaiAeroStrategy } from "../core/rewards/strategies/HaiAeroStrategy";
import { calculateStrategyRewards } from "../core/rewards/calculateRewards";

type RewardCalculatorOptions = {
  startBlock: number;
  endBlock: number;
};

/**
 * V2 implementation of haiAERO rewards using the new RewardStrategy abstraction.
 * Produces identical results to calculateHaiaeroRewards but uses the shared
 * TimeWeightedDistributor engine.
 */
export const calculateHaiaeroRewardsV2 = async (
  rewardAmount: number,
  options?: RewardCalculatorOptions
): Promise<{ users: UserList }> => {
  const {
    startBlock = config().HAIAERO_START_BLOCK,
    endBlock = config().HAIAERO_END_BLOCK,
  } = options ?? {};

  console.log(
    `[V2] Calculating haiAERO rewards from block ${startBlock} to ${endBlock}`
  );

  const strategy = new HaiAeroStrategy();

  const earned = await calculateStrategyRewards(
    strategy,
    { startBlock, endBlock },
    rewardAmount,
    haiveloProvider
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

  return { users };
};
