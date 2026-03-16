import {
  getStakingPositions,
  calculateStakingAtTimestamp,
  StakingPostion,
} from '../skite-data';

import { LpStakingPositionEvent } from '../lp-staking-data';
import { UserAccount, UserList } from '../../types';
import { config } from '../../config';
import { lpStakingProvider } from '../../utils/chain';
import { getOrCreateUserMutate } from '../../utils';

type BoostAmounts = Record<string, number>;

type ProcessorOptions = {
  startBlock: number;
  endBlock: number;
};

export type LpStakingDebugEvent =
  | { type: 'init'; startTimestamp: number; endTimestamp: number; rewardRate: number }
  | { type: 'updateRewardPerWeight'; timestamp: number; rewardPerWeight: number; totalStakingWeight: number }
  | { type: 'userEarn'; address: string; deltaEarned: number; totalEarned: number; rewardPerWeight: number; boost: number; stakingWeight: number; timestamp: number }
  | { type: 'userWeightChange'; address: string; stakingWeight: number; lpStaked: number; timestamp: number };

/**
 * Process LP staking reward events with KITE staking boost
 * 
 * The boost is calculated as: min(userKiteShare / userLpStakingShare + 1, 2)
 * This rewards users who stake proportionally more KITE relative to their LP stake.
 */
export const processLpStakingRewardEvents = async (
  rewardAmount: number,
  events: LpStakingPositionEvent[],
  users: UserList,
  options?: ProcessorOptions,
  debug?: boolean
): Promise<{ users: UserList; debugEvents?: LpStakingDebugEvent[] }> => {
  const debugEvents: LpStakingDebugEvent[] = [];

  // Fetch KITE staking positions for boost calculation
  const stakingPositions = await getStakingPositions();

  const {
    startBlock: optionsStartBlock,
    endBlock: optionsEndBlock,
  } = options ?? {};

  // Use provided blocks, or fetch latest from RPC if endBlock not set
  const resolvedStartBlock = optionsStartBlock ?? config().LP_STAKING_START_BLOCK;
  const resolvedEndBlock = optionsEndBlock ?? config().LP_STAKING_END_BLOCK ?? await lpStakingProvider.getBlockNumber();

  // Get timestamps from blocks
  const startTimestamp = (await lpStakingProvider.getBlock(resolvedStartBlock)).timestamp;
  const endTimestamp = (await lpStakingProvider.getBlock(resolvedEndBlock)).timestamp;

  // Calculate reward rate per second
  const rewardRate = rewardAmount / (endTimestamp - startTimestamp);
  if (debug) debugEvents.push({ type: 'init', startTimestamp, endTimestamp, rewardRate });

  // Current timestamp for processing
  let timestamp = startTimestamp;

  /**
   * Calculate boost amounts for all users based on KITE staking vs LP staking ratio
   * Boost formula: min(userKiteShare / userLpStakingShare + 1, 2)
   */
  const calculateUserLpStakingBoosts = (users: UserList): BoostAmounts => {
    // Get KITE staking state at current timestamp
    const stakingState = calculateStakingAtTimestamp(stakingPositions, timestamp);

    // Calculate total LP staked across all users
    const totalLpStaked = Object.values(users).reduce(
      (acc, user) => acc + user.stakingWeight,
      0
    );

    return Object.entries(stakingState.users).reduce(
      (pV, [addr, kiteData]) => {
        // User's LP staking amount
        const userLpStaked = users[addr]?.stakingWeight ?? 0;

        // User's share of total LP staked
        const userLpShare = totalLpStaked > 0 ? userLpStaked / totalLpStaked : 0;

        // User's KITE staking share
        const userKiteShare = kiteData.share;

        // Calculate boost: min(kiteShare / lpShare + 1, 2)
        // If user has LP stake but no KITE stake, boost is 1
        // If user has more KITE stake proportion than LP stake proportion, they get a boost up to 2x
        const boost = userLpShare > 0
          ? Math.min(userKiteShare / userLpShare + 1, 2)
          : 1;

        return {
          ...pV,
          [addr]: boost,
        };
      },
      {} as BoostAmounts
    );
  };

  // Initialize total staking weight with boosts
  let totalStakingWeight = sumAllWeights(users, calculateUserLpStakingBoosts(users));

  // Cumulative reward per unit of weight
  let rewardPerWeight = 0;

  // Update reward per weight based on time elapsed
  const updateRewardPerWeight = (evtTime: number) => {
    if (totalStakingWeight > 0) {
      const deltaTime = evtTime - timestamp;
      rewardPerWeight += (deltaTime * rewardRate) / totalStakingWeight;
    }
    if (debug) {
      debugEvents.push({
        type: 'updateRewardPerWeight',
        timestamp: evtTime,
        rewardPerWeight,
        totalStakingWeight,
      });
    }
  };

  // Process each event in chronological order
  console.log(`Processing ${events.length} LP staking events...`);
  console.log(`Distributing ${rewardAmount} rewards at rate ${rewardRate}/sec from ${startTimestamp} to ${endTimestamp}`);

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const eventTimestamp = parseInt(event.timestamp);

    if (i % 1000 === 0 && i > 0) console.log(`  Processed ${i} events`);

    // Update reward per weight up to this event's timestamp
    updateRewardPerWeight(eventTimestamp);

    // Update current timestamp
    timestamp = eventTimestamp;

    // Get or create user
    const userAddress = event.user.id.toLowerCase();
    const user = getOrCreateUserMutate(userAddress, users);

    // Credit all users their earned rewards before updating balances
    const boostAmounts = calculateUserLpStakingBoosts(users);
    Object.values(users).forEach((u) => {
      const prevEarned = u.earned;
      earn(u, rewardPerWeight, boostAmounts);
      if (debug) {
        debugEvents.push({
          type: 'userEarn',
          address: u.address,
          deltaEarned: u.earned - prevEarned,
          totalEarned: u.earned,
          rewardPerWeight,
          boost: boostAmounts[u.address] ?? 1,
          stakingWeight: u.stakingWeight,
          timestamp,
        });
      }
    });

    // Update user's LP staking balance based on event type
    const amount = Number(event.amount) / 1e18; // Convert from wei

    if (event.type === 'STAKE') {
      user.collateral += amount;
    } else if (event.type === 'WITHDRAW') {
      user.collateral -= amount;
    }

    // Handle dusty balances
    if (user.collateral < 0 && user.collateral > -0.0001) {
      user.collateral = 0;
    }

    // Update staking weight to match collateral (LP staked amount)
    user.stakingWeight = user.collateral;

    if (debug) {
      debugEvents.push({
        type: 'userWeightChange',
        address: user.address,
        stakingWeight: user.stakingWeight,
        lpStaked: user.collateral,
        timestamp,
      });
    }

    // Sanity check
    Object.values(users).forEach((u) => {
      if (u.earned < 0) {
        throw new Error(`Negative earned amount for user ${u.address}`);
      }
    });

    // Recalculate total staking weight
    totalStakingWeight = sumAllWeights(users, calculateUserLpStakingBoosts(users));
  }

  // Final crediting of rewards up to end timestamp
  updateRewardPerWeight(endTimestamp);
  const finalBoostAmounts = calculateUserLpStakingBoosts(users);
  Object.values(users).forEach((u) => {
    const prevEarned = u.earned;
    earn(u, rewardPerWeight, finalBoostAmounts);
    if (debug) {
      debugEvents.push({
        type: 'userEarn',
        address: u.address,
        deltaEarned: u.earned - prevEarned,
        totalEarned: u.earned,
        rewardPerWeight,
        boost: finalBoostAmounts[u.address] ?? 1,
        stakingWeight: u.stakingWeight,
        timestamp: endTimestamp,
      });
    }
  });

  return { users, debugEvents: debug ? debugEvents : undefined };
};

/**
 * Credit earned rewards to a user based on their staking weight and boost
 */
const earn = (
  user: UserAccount,
  rewardPerWeight: number,
  boostAmounts: BoostAmounts
): void => {
  const boostAmount = boostAmounts[user.address] ?? 1;

  // Credit earned rewards
  user.earned +=
    (rewardPerWeight - user.rewardPerWeightStored) *
    user.stakingWeight *
    boostAmount;

  // Store the reward per weight for next calculation
  user.rewardPerWeightStored = rewardPerWeight;
};

/**
 * Sum all staking weights with boost multipliers
 */
const sumAllWeights = (users: UserList, boostAmounts: BoostAmounts): number => {
  return Object.values(users).reduce((acc, user) => {
    const boostAmount = boostAmounts[user.address] ?? 1;
    return acc + user.stakingWeight * boostAmount;
  }, 0);
};

