import { config } from "../config";
import { UserList } from "../types";
import { calculateLpRewards } from "./lp-rewards";
import { calculateMinterRewards } from "./minter-rewards";

type FinalResult = Record<string, Record<string, UserList>>;

type RewardResult = {
  address: string;
  earned: number;
};

type RewardsMap = {
  [token: string]: RewardResult[];
};

export function combineRewards(
  lpRewards: RewardsMap,
  minterRewards: RewardsMap
): RewardsMap {
  // Get all unique reward tokens
  const allTokens = new Set([
    ...Object.keys(lpRewards),
    ...Object.keys(minterRewards),
  ]);

  const combinedRewards: RewardsMap = {};

  // Process each reward token
  for (const token of allTokens) {
    // Get rewards for current token
    const lpTokenRewards = lpRewards[token] || [];
    const minterTokenRewards = minterRewards[token] || [];

    // Create a map to combine rewards by address
    const addressMap = new Map<string, number>();

    // Add LP rewards
    lpTokenRewards.forEach(({ address, earned }) => {
      addressMap.set(address, (addressMap.get(address) || 0) + earned);
    });

    // Add minter rewards
    minterTokenRewards.forEach(({ address, earned }) => {
      addressMap.set(address, (addressMap.get(address) || 0) + earned);
    });

    // Convert map to array and sort by earned amount
    combinedRewards[token] = Array.from(addressMap.entries())
      .map(([address, earned]) => ({
        address,
        earned,
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }

  return combinedRewards;
}

export const combineResults = async () => {
  const minterRewards = await calculateMinterRewards(
    config().START_BLOCK,
    config().END_BLOCK
  );

  // Minter Rewards

  function aggregateTokenRewards(
    minterRewards: FinalResult,
    tokenToAggregate: string = "KITE"
  ) {
    // Get all collateral types that have the specified token rewards
    const collateralTypes = Object.keys(minterRewards[tokenToAggregate] || {});

    // Create a map to store aggregated rewards per address
    const aggregatedRewards = new Map<string, number>();

    // Iterate through each collateral type
    collateralTypes.forEach((collateralType) => {
      const rewardsForCollateral =
        minterRewards[tokenToAggregate][collateralType];

      // Add rewards for each address
      Object.entries(rewardsForCollateral).forEach(([address, value]) => {
        const currentTotal = aggregatedRewards.get(address) || 0;
        aggregatedRewards.set(address, currentTotal + value.earned);
      });
    });

    // Convert to array and sort by earned amount
    const sortedResults = Array.from(aggregatedRewards.entries())
      .map(([address, earned]) => ({
        address,
        earned,
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);

    return {
      [tokenToAggregate]: sortedResults,
    };
  }

  const minterRewardsAggregated = aggregateTokenRewards(minterRewards);

  console.log(config().rewards.minter.config);
  console.log(config().rewards.lp.config);

  let lpRewards: Record<string, { address: string; earned: number }[]> = {};

  for (const [rewardToken, amount] of Object.entries(
    config().rewards.lp.config
  )) {
    const rewards = await calculateLpRewards(6600);

    lpRewards[rewardToken] = Object.entries(rewards)
      .map(([address, value]) => ({
        address,
        earned: value.earned,
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }

  console.log(lpRewards, "lpRewards");
  console.log("aggregated result", minterRewardsAggregated);

  // Combine LP and Minter rewards
  const combinedRewards = combineRewards(lpRewards, minterRewardsAggregated);
  console.log("Combined rewards:", combinedRewards);

  return combinedRewards;
};

combineResults();
