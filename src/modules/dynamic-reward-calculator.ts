import { BlockRange } from "../core/interfaces/IRewardStrategy";

/**
 * Returns the total reward amount for a given reward token over a block range.
 * Individual collateral types receive a fraction of this total
 * as defined in the window's dynamic config.
 */
export type DynamicRewardCalculator = (
  rewardToken: string,
  blockRange: BlockRange
) => Promise<number>;

/**
 * Stub implementation — throws to prevent silent misconfiguration.
 * Replace with the actual calculation logic when ready.
 */
export const getDynamicTotalReward: DynamicRewardCalculator = async (
  rewardToken: string,
  blockRange: BlockRange
): Promise<number> => {
  throw new Error(
    `Dynamic reward calculation not yet implemented. ` +
      `Token: ${rewardToken}, blocks: ${blockRange.startBlock}-${blockRange.endBlock}`
  );
};
