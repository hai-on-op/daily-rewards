import { providers } from "ethers";
import { RewardStrategy, BlockRange, StrategyEvent } from "../interfaces/IRewardStrategy";
import { TimeWeightedDistributor, DailySnapshot } from "./TimeWeightedDistributor";

const distributor = new TimeWeightedDistributor();

export interface StrategyRewardsResult {
  earned: Map<string, number>;
  dailySnapshots: DailySnapshot[];
}

export async function calculateStrategyRewards<
  TEvent extends StrategyEvent,
  TUserState
>(
  strategy: RewardStrategy<TEvent, TUserState>,
  blockRange: BlockRange,
  rewardAmount: number,
  provider: providers.Provider
): Promise<Map<string, number>> {
  const result = await calculateStrategyRewardsDetailed(
    strategy,
    blockRange,
    rewardAmount,
    provider
  );
  return result.earned;
}

export async function calculateStrategyRewardsDetailed<
  TEvent extends StrategyEvent,
  TUserState
>(
  strategy: RewardStrategy<TEvent, TUserState>,
  blockRange: BlockRange,
  rewardAmount: number,
  provider: providers.Provider
): Promise<StrategyRewardsResult> {
  const [startTimestamp, endTimestamp] = await Promise.all([
    provider.getBlock(blockRange.startBlock).then((b) => b.timestamp),
    provider.getBlock(blockRange.endBlock).then((b) => b.timestamp),
  ]);

  const [initialUsers, events] = await Promise.all([
    strategy.getInitialUsers(blockRange),
    strategy.getEvents(blockRange),
  ]);

  console.log(
    `[${strategy.name}] ${initialUsers.size} initial users, ${events.length} events, ` +
      `blocks ${blockRange.startBlock}-${blockRange.endBlock}`
  );

  const result = await distributor.distribute(strategy, events, initialUsers, {
    startTimestamp,
    endTimestamp,
    rewardAmount,
  });

  return { earned: result.earned, dailySnapshots: result.dailySnapshots };
}
