import { config } from "../config";
import { getTokenTransfersToContract } from "../services/reward-distributor-deposits";
import { UserList } from "../types";
import { calculateHaiveloRewards } from "./haivelo-rewards";
import { calculateLpRewards } from "./lp-rewards";
import { calculateMinterRewards } from "./minter-rewards";

type FinalResult = Record<string, Record<string, UserList>>;

export type RewardResult = {
  address: string;
  earned: number;
};

export type RewardsMap = {
  [token: string]: RewardResult[];
};

export function combineRewards(rewardsMaps: RewardsMap[]): RewardsMap {
  // Get all unique reward tokens
  const allTokens = new Set<string>();

  // Collect all token types from all reward maps
  rewardsMaps.forEach((rewardsMap) => {
    Object.keys(rewardsMap).forEach((token) => allTokens.add(token));
  });

  const combinedRewards: RewardsMap = {};

  // Process each reward token
  for (const token of allTokens) {
    // Create a map to combine rewards by address
    const addressMap = new Map<string, number>();

    // Process each rewards map for this token
    rewardsMaps.forEach((rewardsMap) => {
      const tokenRewards = rewardsMap[token] || [];

      // Add rewards
      tokenRewards.forEach(({ address, earned }) => {
        addressMap.set(address, (addressMap.get(address) || 0) + earned);
      });
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

export const combineResults = async (): Promise<RewardsMap> => {
  console.log("executing combineResults");

  type RewardObject = Record<string, { address: string; earned: number }[]>;

  let haiVeloRewards: RewardObject = {};
  let haiVeloHistoricalRewards: RewardObject = {};
  let haiVeloDailyHistoricalRewards: Array<RewardObject> = [];
  let lpRewards: RewardObject = {};
  let lpHistoricalRewards: RewardObject = {};

  const FILTER_CONSTANT = 10 ** 18;
  const REWARD_DEPOSIT_ِEPOCH_BLOCK = (7 * 24 * 60 * 60) / 2; // 2 seconds block time

  const HaiVeloTransfers = (await getTokenTransfersToContract())
    .filter((t) => Number(t.value) >= FILTER_CONSTANT)
    .map((t) => ({
      ...t,
      value: Number(t.value) / 10 ** 18,
    }));

  console.log(HaiVeloTransfers);

  for (const [rewardToken, amount] of Object.entries(
    config().rewards.haiVelo.historicConfig
  )) {
    const rewards = await calculateHaiveloRewards(amount, {
      startBlock: config().HAIVELO_HISTORIC_START_BLOCK,
      // The rewards of Transfers are calculated for the previous epoch
      endBlock: HaiVeloTransfers[0].blockNumber - REWARD_DEPOSIT_ِEPOCH_BLOCK, ///config().HAIVELO_START_BLOCK,
    });

    haiVeloHistoricalRewards[rewardToken] = Object.entries(rewards)
      .map(([address, value]) => ({
        address,
        earned: value.earned,
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }

  for (let i = 0; i < HaiVeloTransfers.length; i++) {
    const HaiVeloTransfer = HaiVeloTransfers[i];

    const rewardsAmount = Number(HaiVeloTransfer.value);

    console.log("rewardsAmount====>", rewardsAmount);

    let rewards;

    if (i === 0) {
      rewards = await calculateHaiveloRewards(rewardsAmount, {
        startBlock:
          HaiVeloTransfers[0].blockNumber - REWARD_DEPOSIT_ِEPOCH_BLOCK,
        // The rewards of Transfers are calculated for the previous epoch
        endBlock: HaiVeloTransfers[0].blockNumber, ///config().HAIVELO_START_BLOCK,
      });
    } else if (i === HaiVeloTransfers.length - 1) {
      const calulcationBlock = config().HAIVELO_END_BLOCK;

      let rewardAmountForTheLastIncompleteEpoch =
        ((calulcationBlock - HaiVeloTransfers[i - 1].blockNumber) /
          REWARD_DEPOSIT_ِEPOCH_BLOCK) *
        rewardsAmount;

      rewards = await calculateHaiveloRewards(
        rewardAmountForTheLastIncompleteEpoch,
        {
          startBlock: HaiVeloTransfers[i - 1].blockNumber,
          endBlock: calulcationBlock,
        }
      );
    } else {
      rewards = await calculateHaiveloRewards(rewardsAmount, {
        startBlock: HaiVeloTransfers[i - 1].blockNumber,
        endBlock: HaiVeloTransfers[i].blockNumber,
      });
    }

    // Add support for different reward tokens
    haiVeloRewards["OP"] = Object.entries(rewards)
      .map(([address, value]) => ({
        address,
        earned: value.earned,
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);

    console.log("haiVeloRewards====>", haiVeloRewards);

    haiVeloDailyHistoricalRewards.push(haiVeloRewards);
  }

  /* Legacy code for haiVelo rewards
  for (const [rewardToken, amount] of Object.entries(
    config().rewards.haiVelo.config
  )) {
    const rewards = await calculateHaiveloRewards(amount, {
      startBlock: config().HAIVELO_START_BLOCK,
      endBlock: config().HAIVELO_END_BLOCK,
    });

    haiVeloRewards[rewardToken] = Object.entries(rewards)
      .map(([address, value]) => ({
        address,
        earned: value.earned,
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }*/

  for (const [rewardToken, amount] of Object.entries(
    config().rewards.lp.historicConfig
  )) {
    const rewards = await calculateLpRewards(amount, {
      startBlock: config().LP_HISTORIC_START_BLOCK,
      endBlock: config().LP_START_BLOCK,
    });

    lpHistoricalRewards[rewardToken] = Object.entries(rewards)
      .map(([address, value]) => ({
        address,
        earned: value.earned,
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }

  for (const [rewardToken, amount] of Object.entries(
    config().rewards.lp.config
  )) {
    const rewards = await calculateLpRewards(amount);

    lpRewards[rewardToken] = Object.entries(rewards)
      .map(([address, value]) => ({
        address,
        earned: value.earned,
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }

  // Combine LP and Minter rewards
  const combinedRewards = combineRewards([
    lpHistoricalRewards,
    lpRewards,
    haiVeloHistoricalRewards,
    ...haiVeloDailyHistoricalRewards,
  ]);

  return combinedRewards;
};

// Legacy code for minter rewards

/**
 * 
 
 const minterRewards = await calculateMinterRewards(
    config().MINTER_START_BLOCK,
    config().MINTER_END_BLOCK
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

  const kiteRewardsAggregated = aggregateTokenRewards(minterRewards, "KITE");
  const opRewardsAggregated = aggregateTokenRewards(minterRewards, "OP");
  const dineroRewardsAggregated = aggregateTokenRewards(
    minterRewards,
    "DINERO"
  );

  const minterRewardsAggregated = {
    ...kiteRewardsAggregated,
    ...opRewardsAggregated,
    ...dineroRewardsAggregated,
  };
 */
