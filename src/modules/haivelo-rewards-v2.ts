import { UserList } from "../types";
import { config } from "../config";
import { haiveloProvider } from "../utils/chain";
import { HaiVeloStrategy } from "../core/rewards/strategies/HaiVeloStrategy";
import { calculateStrategyRewards } from "../core/rewards/calculateRewards";

type RewardCalculatorOptions = {
  startBlock: number;
  endBlock: number;
};

/**
 * V2 implementation of haiVELO rewards using the new RewardStrategy abstraction.
 * Produces identical results to calculateHaiveloRewards but uses the shared
 * TimeWeightedDistributor engine.
 */
export const calculateHaiveloRewardsV2 = async (
  rewardAmount: number,
  options?: RewardCalculatorOptions
): Promise<UserList> => {
  const {
    startBlock = config().HAIVELO_START_BLOCK,
    endBlock = config().HAIVELO_END_BLOCK,
  } = options ?? {};

  console.log(
    `[V2] Calculating haiVELO rewards from block ${startBlock} to ${endBlock}`
  );

  const strategy = new HaiVeloStrategy(haiveloProvider);

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

  return users;
};
