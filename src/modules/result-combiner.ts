import { config } from '../config';
import {
  getTokenTransfersToContract,
  getHaiaeroTokenTransfersToContract,
  TokenTransfer
} from '../services/reward-distributor-deposits';
import { UserList } from '../types';
import { calculateHaiveloRewardsV2 as calculateHaiveloRewards } from './haivelo-rewards-v2';
import { calculateHaiaeroRewardsV2 as calculateHaiaeroRewards } from './haiaero-rewards-v2';
import { calculateLpRewardsV2 as calculateLpRewards } from './lp-rewards-v2';
import { calculateMinterRewardsV2 as calculateMinterRewards } from './minter-rewards-v2';
import { calculateLpStakingRewardsV2 as calculateLpStakingRewards } from './lp-staking-rewards-v2';

type FinalResult = Record<string, Record<string, UserList>>;

export type RewardResult = {
  address: string;
  earned: number;
};

export type RewardsMap = {
  [token: string]: RewardResult[];
};

type RewardObject = Record<string, { address: string; earned: number }[]>;

type ProcessedTransfer = {
  blockNumber: number;
  value: number;
  tokenSymbol: string;
};

export function combineRewards(rewardsMaps: RewardsMap[]): RewardsMap {
  // Get all unique reward tokens
  const allTokens = new Set<string>();

  // Collect all token types from all reward maps
  rewardsMaps.forEach(rewardsMap => {
    Object.keys(rewardsMap).forEach(token => allTokens.add(token));
  });

  const combinedRewards: RewardsMap = {};

  // Process each reward token
  for (const token of allTokens) {
    // Create a map to combine rewards by address
    const addressMap = new Map<string, number>();

    // Process each rewards map for this token
    rewardsMaps.forEach(rewardsMap => {
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
        earned
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }

  return combinedRewards;
}

/**
 * Fetches and processes token transfers to the contract for all supported tokens
 */
async function getProcessedTransfers(): Promise<ProcessedTransfer[]> {
  const FILTER_CONSTANT = 10 ** 18;

  const transfers: TokenTransfer[] = await getTokenTransfersToContract();

  return transfers
    .filter(t => Number(t.value) >= FILTER_CONSTANT)
    .map(t => ({
      blockNumber: t.blockNumber,
      value: Number(t.value) / 10 ** 18,
      tokenSymbol: t.tokenSymbol
    }));
}

/**
 * Calculates historical HaiVelo rewards before the transfer-based system
 */
async function calculateHaiVeloHistoricalRewards(
  earliestTransferBlock: number,
  rewardDepositEpochBlock: number
): Promise<RewardObject> {
  const haiVeloHistoricalRewards: RewardObject = {};

  for (const [rewardToken, amount] of Object.entries(
    config().rewards.haiVelo.historicConfig
  )) {
    const rewards = await calculateHaiveloRewards(amount, {
      startBlock: config().HAIVELO_HISTORIC_START_BLOCK,
      endBlock: earliestTransferBlock - rewardDepositEpochBlock
    });

    haiVeloHistoricalRewards[rewardToken] = Object.entries(rewards)
      .map(([address, value]) => ({
        address,
        earned: value.earned
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }

  return haiVeloHistoricalRewards;
}

/**
 * Calculates rewards for a single HaiVelo transfer period
 */
async function calculateSingleTransferRewards(
  rewardsAmount: number,
  startBlock: number,
  endBlock: number,
  tokenSymbol: string
): Promise<RewardObject> {
  const rewards = await calculateHaiveloRewards(rewardsAmount, {
    startBlock,
    endBlock
  });

  return {
    [tokenSymbol]: Object.entries(rewards)
      .map(([address, value]) => ({
        address,
        earned: value.earned
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned)
  };
}

/**
 * Calculates HaiVelo rewards based on transfer deposits
 */
async function calculateHaiVeloDailyRewards(
  transfers: ProcessedTransfer[]
): Promise<RewardObject[]> {
  if (transfers.length === 0) return [];

  const REWARD_DEPOSIT_ِEPOCH_BLOCK = (7 * 24 * 60 * 60) / 2; // 2 seconds block time
  const haiVeloDailyRewards: RewardObject[] = [];

  for (let i = 0; i < transfers.length; i++) {
    const currentTransfer = transfers[i];
    const rewardsAmount = currentTransfer.value;

    let rewards: RewardObject;

    if (transfers.length === 1) {
      // Single transfer: calculate full period from epoch before transfer to end block
      const calculationBlock = config().HAIVELO_END_BLOCK;
      rewards = await calculateSingleTransferRewards(
        (rewardsAmount * (calculationBlock - currentTransfer.blockNumber)) /
          REWARD_DEPOSIT_ِEPOCH_BLOCK,
        currentTransfer.blockNumber - REWARD_DEPOSIT_ِEPOCH_BLOCK,
        calculationBlock - REWARD_DEPOSIT_ِEPOCH_BLOCK,
        currentTransfer.tokenSymbol
      );
    } else if (i === 0) {
      // First transfer: calculate from epoch before first transfer to first transfer
      rewards = await calculateSingleTransferRewards(
        rewardsAmount,
        currentTransfer.blockNumber - REWARD_DEPOSIT_ِEPOCH_BLOCK,
        currentTransfer.blockNumber,
        currentTransfer.tokenSymbol
      );
    } else if (i === transfers.length - 1) {
      // Last transfer: calculate partial epoch to end block
      const calculationBlock = config().HAIVELO_END_BLOCK;
      const previousTransfer = transfers[i - 1];

      const rewardAmountForLastIncompleteEpoch =
        ((calculationBlock - currentTransfer.blockNumber) /
          REWARD_DEPOSIT_ِEPOCH_BLOCK) *
        rewardsAmount;

      rewards = await calculateSingleTransferRewards(
        rewardAmountForLastIncompleteEpoch,
        previousTransfer.blockNumber,
        calculationBlock - REWARD_DEPOSIT_ِEPOCH_BLOCK,
        currentTransfer.tokenSymbol
      );
    } else {
      // Middle transfers: calculate from previous transfer to current transfer
      const previousTransfer = transfers[i - 1];

      rewards = await calculateSingleTransferRewards(
        rewardsAmount,
        previousTransfer.blockNumber,
        currentTransfer.blockNumber,
        currentTransfer.tokenSymbol
      );
    }

    console.log(`${currentTransfer.tokenSymbol} rewards:`, rewards);
    haiVeloDailyRewards.push(rewards);
  }

  return haiVeloDailyRewards;
}

/**
 * Fetches and processes haiAERO token transfers to the contract
 */
async function getHaiaeroProcessedTransfers(): Promise<ProcessedTransfer[]> {
  const FILTER_CONSTANT = 10 ** 18;

  const transfers: TokenTransfer[] = await getHaiaeroTokenTransfersToContract();

  return transfers
    .filter(t => Number(t.value) >= FILTER_CONSTANT)
    .map(t => ({
      blockNumber: t.blockNumber,
      value: Number(t.value) / 10 ** 18,
      tokenSymbol: t.tokenSymbol
    }));
}

/**
 * Calculates rewards for a single HaiAero transfer period
 */
async function calculateSingleHaiaeroTransferRewards(
  rewardsAmount: number,
  startBlock: number,
  endBlock: number,
  tokenSymbol: string,
  _debug?: boolean
): Promise<{ rewards: RewardObject }> {
  const { users } = await calculateHaiaeroRewards(
    rewardsAmount,
    { startBlock, endBlock }
  );

  const rewards: RewardObject = {
    [tokenSymbol]: Object.entries(users)
      .map(([address, value]) => ({
        address,
        earned: (value as any).earned
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned)
  };

  return { rewards };
}

/**
 * Calculates HaiAero rewards based on transfer deposits.
 * When DEBUG_HAIAERO is enabled, writes detailed debug data to debug-data/haiaero/.
 */
async function calculateHaiAeroDailyRewards(
  transfers: ProcessedTransfer[]
): Promise<RewardObject[]> {
  if (transfers.length === 0) return [];

  const REWARD_DEPOSIT_EPOCH_BLOCK = (7 * 24 * 60 * 60) / 2; // 2 seconds block time
  const haiAeroDailyRewards: RewardObject[] = [];

  for (let i = 0; i < transfers.length; i++) {
    const currentTransfer = transfers[i];
    const rewardsAmount = currentTransfer.value;

    let result: { rewards: RewardObject };

    if (transfers.length === 1) {
      const calculationBlock = config().HAIAERO_END_BLOCK;
      result = await calculateSingleHaiaeroTransferRewards(
        (rewardsAmount * (calculationBlock - currentTransfer.blockNumber)) /
          REWARD_DEPOSIT_EPOCH_BLOCK,
        currentTransfer.blockNumber - REWARD_DEPOSIT_EPOCH_BLOCK,
        calculationBlock - REWARD_DEPOSIT_EPOCH_BLOCK,
        currentTransfer.tokenSymbol
      );
    } else if (i === 0) {
      result = await calculateSingleHaiaeroTransferRewards(
        rewardsAmount,
        currentTransfer.blockNumber - REWARD_DEPOSIT_EPOCH_BLOCK,
        currentTransfer.blockNumber,
        currentTransfer.tokenSymbol
      );
    } else if (i === transfers.length - 1) {
      const calculationBlock = config().HAIAERO_END_BLOCK;
      const previousTransfer = transfers[i - 1];

      const rewardAmountForLastIncompleteEpoch =
        ((calculationBlock - currentTransfer.blockNumber) /
          REWARD_DEPOSIT_EPOCH_BLOCK) *
        rewardsAmount;

      result = await calculateSingleHaiaeroTransferRewards(
        rewardAmountForLastIncompleteEpoch,
        previousTransfer.blockNumber,
        calculationBlock - REWARD_DEPOSIT_EPOCH_BLOCK,
        currentTransfer.tokenSymbol
      );
    } else {
      const previousTransfer = transfers[i - 1];

      result = await calculateSingleHaiaeroTransferRewards(
        rewardsAmount,
        previousTransfer.blockNumber,
        currentTransfer.blockNumber,
        currentTransfer.tokenSymbol
      );
    }

    console.log(`haiAERO ${currentTransfer.tokenSymbol} rewards:`, result.rewards);
    haiAeroDailyRewards.push(result.rewards);
  }

  return haiAeroDailyRewards;
}

/**
 * Calculates historical LP rewards
 */
async function calculateLpHistoricalRewards(): Promise<RewardObject> {
  const lpHistoricalRewards: RewardObject = {};

  for (const [rewardToken, amount] of Object.entries(
    config().rewards.lp.historicConfig
  )) {
    const rewards = await calculateLpRewards(amount, {
      startBlock: config().LP_HISTORIC_START_BLOCK,
      endBlock: config().LP_START_BLOCK
    });

    lpHistoricalRewards[rewardToken] = Object.entries(rewards)
      .map(([address, value]) => ({
        address,
        earned: value.earned
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }

  return lpHistoricalRewards;
}

/**
 * Calculates current LP rewards
 */
async function calculateCurrentLpRewards(): Promise<RewardObject> {
  const lpRewards: RewardObject = {};

  for (const [rewardToken, amount] of Object.entries(
    config().rewards.lp.config
  )) {
    const rewards = await calculateLpRewards(amount);

    lpRewards[rewardToken] = Object.entries(rewards)
      .map(([address, value]) => ({
        address,
        earned: value.earned
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }

  return lpRewards;
}

/**
 * Calculates current minter rewards
 * Note: toBlock is optional - if not set in config, the module will fetch latest block from RPC
 */
async function calculateCurrentMinterRewards(): Promise<RewardObject> {
  const minterRewards: RewardObject = {};

  // Don't pass endBlock if it's 0 or NaN - let the module fetch latest from RPC
  const endBlock = config().MINTER_END_BLOCK;
  const rewards = await calculateMinterRewards(
    config().MINTER_START_BLOCK,
    endBlock && !isNaN(endBlock) ? endBlock : undefined
  );

  // Derive all reward tokens from computed rewards
  const rewardTokens = Object.keys(rewards);
  for (let i = 0; i < rewardTokens.length; i++) {
    const rewardToken = rewardTokens[i];
    const output: Record<string, number> = {};
    const entries = Object.entries(rewards[rewardToken] || {});
    for (let j = 0; j < entries.length; j++) {
      const [, userData] = entries[j];
      const userDataEntries = Object.entries(userData);
      for (let k = 0; k < userDataEntries.length; k++) {
        const [address, value] = userDataEntries[k];
        const earned = value.earned;
        output[address] = (output[address] || 0) + earned;
      }
    }

    minterRewards[rewardToken] = Object.entries(output)
      .map(([address, earned]) => ({ address, earned }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }

  return minterRewards;
}

/**
 * Calculates current LP staking rewards (HaiBoldCurveLPStaking and HaiVeloVeloLPStaking)
 * Note: toBlock is optional - if not set in config, the module will fetch latest block from RPC
 */
async function calculateCurrentLpStakingRewards(): Promise<RewardObject> {
  const lpStakingRewards: RewardObject = {};

  // Check if LP staking rewards are configured
  if (config().rewards.lpStaking.windows.length === 0) {
    return lpStakingRewards;
  }

  // Don't pass endBlock if it's 0 or NaN - let the module fetch latest from RPC
  const endBlock = config().LP_STAKING_END_BLOCK;
  const rewards = await calculateLpStakingRewards(
    config().LP_STAKING_START_BLOCK,
    endBlock && !isNaN(endBlock) ? endBlock : undefined
  );

  // Aggregate rewards across staking types per reward token
  const rewardTokens = Object.keys(rewards);
  for (let i = 0; i < rewardTokens.length; i++) {
    const rewardToken = rewardTokens[i];
    const output: Record<string, number> = {};
    const entries = Object.entries(rewards[rewardToken] || {});
    for (let j = 0; j < entries.length; j++) {
      const [, userData] = entries[j];
      const userDataEntries = Object.entries(userData);
      for (let k = 0; k < userDataEntries.length; k++) {
        const [address, value] = userDataEntries[k];
        const earned = value.earned;
        output[address] = (output[address] || 0) + earned;
      }
    }

    lpStakingRewards[rewardToken] = Object.entries(output)
      .map(([address, earned]) => ({ address, earned }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);
  }

  return lpStakingRewards;
}

// export const combineResults = async (): Promise<RewardsMap> => {
export const combineResults = async () => {
  const REWARD_DEPOSIT_ِEPOCH_BLOCK = (7 * 24 * 60 * 60) / 2; // 2 seconds block time

  const haiaeroEnabled = config().HAIAERO_REWARDS_ENABLED;

  // Fetch and process transfers for both haiVELO and haiAERO
  const [processedTransfers, haiaeroProcessedTransfers] = await Promise.all([
    getProcessedTransfers(),
    haiaeroEnabled ? getHaiaeroProcessedTransfers() : Promise.resolve([]),
  ]);
  console.log(
    `Processed ${processedTransfers.length} haiVELO transfers:`,
    processedTransfers
  );
  if (haiaeroEnabled) {
    console.log(
      `Processed ${haiaeroProcessedTransfers.length} haiAERO transfers:`,
      haiaeroProcessedTransfers
    );
  } else {
    console.log('haiAERO rewards disabled (HAIAERO_REWARDS_ENABLED=false)');
  }

  // Find the earliest block number across all transfers for historical calculation
  const earliestTransferBlock =
    processedTransfers.length > 0
      ? Math.min(...processedTransfers.map(t => t.blockNumber))
      : 0;

  // Calculate all reward types
  const [
    haiVeloHistoricalRewards,
    haiVeloDailyRewards,
    haiAeroDailyRewards,
    lpHistoricalRewards,
    minterRewards,
    lpStakingRewards
    //currentLpRewards,
  ] = await Promise.all([
    earliestTransferBlock > 0
      ? calculateHaiVeloHistoricalRewards(
          earliestTransferBlock,
          REWARD_DEPOSIT_ِEPOCH_BLOCK
        )
      : {},
    calculateHaiVeloDailyRewards(processedTransfers),
    calculateHaiAeroDailyRewards(haiaeroProcessedTransfers),
    calculateLpHistoricalRewards(),
    calculateCurrentMinterRewards(),
    calculateCurrentLpStakingRewards()
    //calculateCurrentLpRewards(),
  ]);

  // Combine all rewards
  const allRewardMaps = [
    lpHistoricalRewards,
    // // //currentLpRewards, // Current LP rewards are removed since we want to redirect them to the Velo rewards
    haiVeloHistoricalRewards,
    ...haiVeloDailyRewards,
    ...haiAeroDailyRewards,
    minterRewards,
    lpStakingRewards
  ];

  const combinedRewards = combineRewards(allRewardMaps);

  return combinedRewards;
};

export const combineResultsProd = async (): Promise<RewardsMap> => {
  console.log('executing combineResults');

  const REWARD_DEPOSIT_ِEPOCH_BLOCK = (7 * 24 * 60 * 60) / 2; // 2 seconds block time

  // Fetch and process transfers
 /* const processedTransfers = await getProcessedTransfers();
  console.log(
    `Processed ${processedTransfers.length} transfers:`,
    processedTransfers
  );

  // Find the earliest block number across all transfers for historical calculation
  const earliestTransferBlock =
    processedTransfers.length > 0
      ? Math.min(...processedTransfers.map(t => t.blockNumber))
      : 0;*/

  // Calculate all reward types
  const [
   // haiVeloHistoricalRewards,
   // haiVeloDailyRewards,
   // lpHistoricalRewards,
   // minterRewards,
    lpStakingRewards
    //currentLpRewards,
  ] = await Promise.all([
   // earliestTransferBlock > 0
   //   ? calculateHaiVeloHistoricalRewards(
   //       earliestTransferBlock,
   //       REWARD_DEPOSIT_ِEPOCH_BLOCK
   //     )
   //   : {},
   // calculateHaiVeloDailyRewards(processedTransfers),
   // calculateLpHistoricalRewards(),
   // calculateMinterRewards(
   //   config().MINTER_START_BLOCK,
   //   config().MINTER_END_BLOCK
    //),
    calculateCurrentLpStakingRewards()
    //calculateCurrentLpRewards(),
  ]);

  // Combine all rewards
  const allRewardMaps = [
  //  lpHistoricalRewards,
  //  //currentLpRewards, // Current LP rewards are removed since we want to redirect them to the Velo rewards
  //  haiVeloHistoricalRewards,
  //  ...haiVeloDailyRewards,
  //  minterRewards,
    lpStakingRewards
  ];

  const combinedRewards = combineRewards(allRewardMaps);

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
