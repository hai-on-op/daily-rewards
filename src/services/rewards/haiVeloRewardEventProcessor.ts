import {
  getStakingPositions,
  calculateStakingAtTimestamp,
  StakingPostion,
  StakingState
} from '../skite-data';

import { HaiveloCollateralEvent } from '../initial-data/getInitialHaiveloState';
import { UserAccount, UserList } from '../../types';
import { config } from '../../config';
import { haiveloProvider } from '../../utils/chain';
import { getOrCreateUserMutate } from '../../utils';
import { SyncEvent, calculateHaiVeloPerLp } from '../haivelo-lp-data';

type BoostAmounts = Record<string, number>;

type ProcessorOptions = {
  startBlock: number;
  endBlock: number;
};

/**
 * Debug event types for collateral-only reward processing (used by haiVELO and haiAERO)
 */
export type CollateralDebugEvent =
  | { type: 'init'; startTimestamp: number; endTimestamp: number; rewardRate: number; rewardAmount: number; totalUsers: number; totalStakingWeight: number }
  | { type: 'updateRewardPerWeight'; timestamp: number; rewardPerWeight: number; totalStakingWeight: number; deltaTime: number }
  | { type: 'userEarn'; address: string; deltaEarned: number; totalEarned: number; rewardPerWeight: number; boost: number; stakingWeight: number; timestamp: number }
  | { type: 'userCollateralChange'; address: string; collateral: number; deltaCollateral: number; stakingWeight: number; timestamp: number; isNewUser: boolean }
  | { type: 'finalSnapshot'; timestamp: number; totalRewardsDistributed: number; users: Array<{ address: string; collateral: number; stakingWeight: number; earned: number; boost: number }> };

/**
 * Event source types for combined haiVELO rewards
 * - COLLATERAL: haiVELO collateral deposit/withdraw events
 * - LP_STAKING: LP token stake/withdraw events
 * - PRICE_UPDATE: Pool sync events that update haiVELO per LP ratio
 */
export type CombinedEventSource = 'COLLATERAL' | 'LP_STAKING' | 'PRICE_UPDATE';

/**
 * Combined event type that can represent collateral, LP staking, and price update events
 * All events are normalized to a common format for processing
 */
export type CombinedHaiVeloEvent = {
  source: CombinedEventSource;
  timestamp: number; // Unix timestamp
  userAddress: string; // Empty for PRICE_UPDATE events
  // For COLLATERAL events: the delta in haiVELO (1 haiVELO collateral = 1 weight)
  // For LP_STAKING events: the delta in raw LP tokens (NOT converted)
  // For PRICE_UPDATE events: not used (set to 0)
  deltaAmount: number;
  // Original event data for debugging
  originalEvent: HaiveloCollateralEvent | LpStakingEventRaw | PriceUpdateEvent;
};

/**
 * LP staking event with raw LP amount (NOT converted)
 */
export type LpStakingEventRaw = {
  id: string;
  userAddress: string;
  amount: string; // Raw LP token amount in wei
  timestamp: string;
  transactionHash: string;
  type: 'STAKE' | 'WITHDRAW';
};

/**
 * Price update event from pool sync
 * Contains the haiVELO per LP ratio at this sync event
 */
export type PriceUpdateEvent = {
  id: string;
  timestamp: string;
  reserve0: string; // haiVELO reserve
  reserve1: string; // VELO reserve
  haiVeloPerLp: number; // haiVELO per LP token at this sync
};

/**
 * Extended UserAccount to track LP staking separately from collateral
 * Stores RAW LP amount - converted to haiVELO-equivalent using current ratio
 */
export interface ExtendedUserState {
  collateral: number; // haiVELO collateral (1:1 weight)
  lpStakedRaw: number; // Raw LP token amount (NOT converted)
}

/**
 * Track extended user states during processing
 */
type ExtendedUserStates = Record<string, ExtendedUserState>;

// Legacy type for backward compatibility
export type LpStakingEventWithPrice = {
  id: string;
  userAddress: string;
  amount: string;
  timestamp: string;
  transactionHash: string;
  type: 'STAKE' | 'WITHDRAW';
  lpPriceInVelo: number;
  veloEquivalent: number;
};

/**
 * Convert a collateral event to a combined event
 */
export const collateralToCombinedEvent = (
  event: HaiveloCollateralEvent
): CombinedHaiVeloEvent => {
  return {
    source: 'COLLATERAL',
    timestamp: Number(event.createdAt),
    userAddress: event.safe.owner.address,
    deltaAmount: Number(event.deltaCollateral), // 1 haiVELO collateral = 1 weight
    originalEvent: event
  };
};

/**
 * Convert an LP staking event to a combined event (with raw LP amount)
 */
export const lpStakingToCombinedEvent = (
  event: LpStakingEventRaw
): CombinedHaiVeloEvent => {
  const lpAmount = Number(event.amount) / 1e18; // Convert from wei to token units
  const delta = event.type === 'STAKE' ? lpAmount : -lpAmount;
  
  return {
    source: 'LP_STAKING',
    timestamp: Number(event.timestamp),
    userAddress: event.userAddress,
    deltaAmount: delta, // Raw LP amount, NOT haiVELO-equivalent
    originalEvent: event
  };
};

/**
 * Convert a sync event to a price update combined event
 * Calculates haiVELO per LP = reserve0 (haiVELO) / totalSupply
 */
export const syncToPriceUpdateEvent = (
  syncEvent: SyncEvent,
  totalSupply: bigint
): CombinedHaiVeloEvent => {
  const haiVeloPerLp = calculateHaiVeloPerLp(syncEvent, totalSupply);
  
  const priceUpdateEvent: PriceUpdateEvent = {
    id: syncEvent.id,
    timestamp: syncEvent.timestamp,
    reserve0: syncEvent.reserve0,
    reserve1: syncEvent.reserve1,
    haiVeloPerLp
  };

  return {
    source: 'PRICE_UPDATE',
    timestamp: Number(syncEvent.timestamp),
    userAddress: '', // No user for price updates
    deltaAmount: 0, // Not applicable for price updates
    originalEvent: priceUpdateEvent
  };
};

/**
 * Merge and sort collateral, LP staking, and price update events by timestamp
 */
export const mergeCombinedEvents = (
  collateralEvents: HaiveloCollateralEvent[],
  lpStakingEvents: LpStakingEventRaw[],
  syncEvents: SyncEvent[],
  totalSupply: bigint
): CombinedHaiVeloEvent[] => {
  const combinedEvents: CombinedHaiVeloEvent[] = [
    ...collateralEvents.map(collateralToCombinedEvent),
    ...lpStakingEvents.map(lpStakingToCombinedEvent),
    ...syncEvents.map(e => syncToPriceUpdateEvent(e, totalSupply))
  ];

  // Sort by timestamp
  combinedEvents.sort((a, b) => a.timestamp - b.timestamp);

  return combinedEvents;
};

/**
 * Legacy merge function for backward compatibility (without sync events)
 */
export const mergeCombinedEventsLegacy = (
  collateralEvents: HaiveloCollateralEvent[],
  lpStakingEvents: LpStakingEventWithPrice[]
): CombinedHaiVeloEvent[] => {
  // Convert legacy LP staking events to raw format
  const rawLpEvents: LpStakingEventRaw[] = lpStakingEvents.map(e => ({
    id: e.id,
    userAddress: e.userAddress,
    amount: e.amount,
    timestamp: e.timestamp,
    transactionHash: e.transactionHash,
    type: e.type
  }));

  const combinedEvents: CombinedHaiVeloEvent[] = [
    ...collateralEvents.map(collateralToCombinedEvent),
    ...rawLpEvents.map(lpStakingToCombinedEvent)
  ];

  // Sort by timestamp
  combinedEvents.sort((a, b) => a.timestamp - b.timestamp);

  return combinedEvents;
};

/**
 * Process combined reward events (collateral, LP staking, and price updates)
 * 
 * Weight calculation:
 * - Collateral: 1 haiVELO = 1 weight
 * - LP staking: LP_staked × (reserve0_haiVELO / totalLPSupply) = haiVELO-equivalent weight
 * 
 * This processor properly handles LP ratio changes over time by recalculating
 * weights whenever the pool reserves change (sync events).
 */
export const processCombinedRewardEvents = async (
  rewardAmount: number,
  combinedEvents: CombinedHaiVeloEvent[],
  users: UserList,
  extendedStates: ExtendedUserStates,
  initialHaiVeloPerLp: number,
  options?: ProcessorOptions
): Promise<UserList> => {
  const stakingPositions = await getStakingPositions();

  const {
    startBlock = config().HAIVELO_START_BLOCK,
    endBlock = config().HAIVELO_END_BLOCK
  } = options
    ? options
    : {
        startBlock: config().HAIVELO_START_BLOCK,
        endBlock: config().HAIVELO_END_BLOCK
      };

  const startTimestamp = (await haiveloProvider.getBlock(startBlock)).timestamp;
  const endTimestamp = (await haiveloProvider.getBlock(endBlock)).timestamp;

  const rewardRate = rewardAmount / (endTimestamp - startTimestamp);

  let timestamp = startTimestamp;
  
  // Track current haiVELO per LP ratio - updated on each PRICE_UPDATE event
  let currentHaiVeloPerLp = initialHaiVeloPerLp;

  /**
   * Recalculate all users' staking weights based on current haiVELO per LP ratio
   * Weight = collateral + (raw LP × haiVELO per LP)
   */
  const recalculateAllWeights = () => {
    Object.entries(extendedStates).forEach(([address, state]) => {
      const user = users[address];
      if (user) {
        // Total weight = collateral + (raw LP × haiVELO per LP)
        user.stakingWeight = state.collateral + (state.lpStakedRaw * currentHaiVeloPerLp);
        user.collateral = user.stakingWeight; // Keep collateral in sync for legacy compatibility
      }
    });
  };

  /**
   * Calculate KITE boost amounts for all users
   * Boost is based on the user's total staking weight (collateral + LP staking in haiVELO)
   */
  const calculateUserBoosts = (users: UserList): BoostAmounts => {
    const stakingState = calculateStakingAtTimestamp(
      stakingPositions,
      timestamp
    );

    // Total weight is stakingWeight (collateral + LP in haiVELO-equivalent)
    const totalWeight = Object.values(users).reduce(
      (acc, user) => acc + user.stakingWeight,
      0
    );

    return Object.entries(stakingState.users).reduce(
      (pV, cV: Record<string, any>) => {
        const userWeight = users[cV[0]] ? users[cV[0]].stakingWeight : 0;
        const userKiteShare = cV[1].share;

        return {
          ...pV,
          [cV[0]]: Math.min(
            userWeight
              ? userKiteShare / (userWeight / totalWeight) + 1
              : 1,
            2
          )
        };
      },
      {}
    );
  };

  // Initialize weights based on initial haiVELO per LP ratio
  recalculateAllWeights();

  let totalStakingWeight = sumAllWeights(users, calculateUserBoosts(users));
  let rewardPerWeight = 0;

  const updateRewardPerWeight = (evtTime: number) => {
    if (totalStakingWeight > 0) {
      const deltaTime = evtTime - timestamp;
      rewardPerWeight += (deltaTime * rewardRate) / totalStakingWeight;
    }
  };

  // Process each combined event
  console.log(`Processing ${combinedEvents.length} combined events (with price updates)...`);
  
  for (let i = 0; i < combinedEvents.length; i++) {
    const event = combinedEvents[i];
    if (i % 1000 === 0 && i > 0) console.log(`  Processed ${i} combined events`);

    updateRewardPerWeight(event.timestamp);
    timestamp = event.timestamp;

    // Credit all users their earned rewards before updating balances
    const boostAmounts = calculateUserBoosts(users);
    Object.values(users).forEach(u => earn(u, rewardPerWeight, boostAmounts));

    // Handle different event types
    if (event.source === 'PRICE_UPDATE') {
      // Update haiVELO per LP ratio from sync event
      const priceEvent = event.originalEvent as PriceUpdateEvent;
      currentHaiVeloPerLp = priceEvent.haiVeloPerLp;
      
      // Recalculate all LP stakers' weights with new ratio
      recalculateAllWeights();
      
    } else if (event.source === 'COLLATERAL') {
      const isNewUser = !users[event.userAddress];
      const user = getOrCreateUserMutate(event.userAddress, users);

      // For new users, set their rewardPerWeightStored to current value
      // so they don't earn rewards from before they deposited
      if (isNewUser) {
        user.rewardPerWeightStored = rewardPerWeight;
      }

      // Initialize extended state if not exists
      if (!extendedStates[event.userAddress]) {
        extendedStates[event.userAddress] = {
          collateral: 0,
          lpStakedRaw: 0
        };
      }

      extendedStates[event.userAddress].collateral += event.deltaAmount;

      // Handle dusty collateral
      if (extendedStates[event.userAddress].collateral < 0 && 
          extendedStates[event.userAddress].collateral > -0.4) {
        extendedStates[event.userAddress].collateral = 0;
      }

      // Update user's weight: collateral + (LP × haiVELO per LP)
      user.stakingWeight = extendedStates[event.userAddress].collateral + 
                          (extendedStates[event.userAddress].lpStakedRaw * currentHaiVeloPerLp);
      user.collateral = user.stakingWeight;

    } else if (event.source === 'LP_STAKING') {
      const isNewUser = !users[event.userAddress];
      const user = getOrCreateUserMutate(event.userAddress, users);

      // For new users, set their rewardPerWeightStored to current value
      // so they don't earn rewards from before they deposited
      if (isNewUser) {
        user.rewardPerWeightStored = rewardPerWeight;
      }

      // Initialize extended state if not exists
      if (!extendedStates[event.userAddress]) {
        extendedStates[event.userAddress] = {
          collateral: 0,
          lpStakedRaw: 0
        };
      }

      // Update raw LP amount
      extendedStates[event.userAddress].lpStakedRaw += event.deltaAmount;

      // Handle dusty LP staking
      if (extendedStates[event.userAddress].lpStakedRaw < 0 && 
          extendedStates[event.userAddress].lpStakedRaw > -0.0001) {
        extendedStates[event.userAddress].lpStakedRaw = 0;
      }

      // Update user's weight using current haiVELO per LP ratio
      user.stakingWeight = extendedStates[event.userAddress].collateral + 
                          (extendedStates[event.userAddress].lpStakedRaw * currentHaiVeloPerLp);
      user.collateral = user.stakingWeight;
    }

    // Sanity check
    Object.values(users).forEach(u => {
      if (u.earned < 0) {
        throw new Error(`Negative earned amount for user ${u.address}`);
      }
    });

    totalStakingWeight = sumAllWeights(users, calculateUserBoosts(users));
  }

  // Final crediting of rewards up to end timestamp
  updateRewardPerWeight(endTimestamp);
  const finalBoostAmounts = calculateUserBoosts(users);
  Object.values(users).forEach(u => earn(u, rewardPerWeight, finalBoostAmounts));

  return users;
};

/**
 * Original processor for backward compatibility (collateral events only)
 * When debug=true, returns detailed debug events for visualization alongside users.
 */
export const processRewardEvents = async (
  rewardAmount: number,
  events: HaiveloCollateralEvent[],
  users: UserList,
  options?: ProcessorOptions,
  debug?: boolean
): Promise<{ users: UserList; debugEvents?: CollateralDebugEvent[] }> => {
  const stakingPositions = await getStakingPositions();
  const debugEvents: CollateralDebugEvent[] = [];

  const {
    startBlock = config().HAIVELO_START_BLOCK,
    endBlock = config().HAIVELO_END_BLOCK
  } = options
    ? options
    : {
        startBlock: config().HAIVELO_START_BLOCK,
        endBlock: config().HAIVELO_END_BLOCK
      };

  const startTimestamp = (await haiveloProvider.getBlock(startBlock)).timestamp;
  const endTimestamp = (await haiveloProvider.getBlock(endBlock)).timestamp;

  const rewardRate = rewardAmount / (endTimestamp - startTimestamp);

  let timestamp = startTimestamp;
  const calculateUserhaiVeloBoosts = (users: UserList): BoostAmounts => {
    const stakingState = calculateStakingAtTimestamp(
      stakingPositions,
      timestamp
    );

    const totalCollatera = Object.values(users).reduce(
      (acc, user) => acc + user.collateral,
      0
    );

    return Object.entries(stakingState.users).reduce(
      (pV, cV: Record<string, any>) => {
        const userDeposited = users[cV[0]] ? users[cV[0]].collateral : 0;

        const userKiteShare = cV[1].share;

        return {
          ...pV,
          [cV[0]]: Math.min(
            userDeposited
              ? userKiteShare /
                  ((userDeposited ? userDeposited : 0) / totalCollatera) +
                  1
              : 1,
            2
          )
        };
      },
      {}
    );
  };

  let totalStakingWeight = sumAllWeights(
    users,
    calculateUserhaiVeloBoosts(users)
  );

  if (debug) {
    debugEvents.push({
      type: 'init',
      startTimestamp,
      endTimestamp,
      rewardRate,
      rewardAmount,
      totalUsers: Object.keys(users).length,
      totalStakingWeight
    });
  }

  let rewardPerWeight = 0; //rewardRate / totalStakingWeight;

  let updateRewardPerWeight = (evtTime: number) => {
    if (totalStakingWeight > 0) {
      const deltaTime = evtTime - timestamp;

      rewardPerWeight += (deltaTime * rewardRate) / totalStakingWeight;

      if (debug) {
        debugEvents.push({
          type: 'updateRewardPerWeight',
          timestamp: evtTime,
          rewardPerWeight,
          totalStakingWeight,
          deltaTime
        });
      }
    }
  };

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (i % 1000 === 0 && i > 0) console.log(`  Processed ${i} events`);

    updateRewardPerWeight(Number(event.createdAt));

    timestamp = Number(event.createdAt);

    const isNewUser = !users[event.safe.owner.address];
    const user = getOrCreateUserMutate(event.safe.owner.address, users);

    const boostAmounts = calculateUserhaiVeloBoosts(users);
    Object.values(users).map(u => {
      if (debug) {
        const prevEarned = u.earned;
        earn(u, rewardPerWeight, boostAmounts);
        if (u.earned !== prevEarned) {
          debugEvents.push({
            type: 'userEarn',
            address: u.address,
            deltaEarned: u.earned - prevEarned,
            totalEarned: u.earned,
            rewardPerWeight,
            boost: boostAmounts[u.address] ?? 1,
            stakingWeight: u.stakingWeight,
            timestamp
          });
        }
      } else {
        earn(u, rewardPerWeight, boostAmounts);
      }
    });

    const deltaCollateral = Number(event.deltaCollateral);
    user.collateral += deltaCollateral;

    // Ignore Dusty collateral
    if (user.collateral < 0 && user.collateral > -0.4) {
      user.collateral = 0;
    }

    user.stakingWeight = user.collateral;

    if (debug) {
      debugEvents.push({
        type: 'userCollateralChange',
        address: user.address,
        collateral: user.collateral,
        deltaCollateral,
        stakingWeight: user.stakingWeight,
        timestamp,
        isNewUser
      });
    }

    const sanityCheckUsers = () => {
      Object.values(users).forEach(user => {
        if (user.earned < 0) {
          throw Error('Earned is negative');
        }
      });
    };

    sanityCheckUsers();

    totalStakingWeight = sumAllWeights(
      users,
      calculateUserhaiVeloBoosts(users)
    );
  }

  updateRewardPerWeight(endTimestamp);

  const finalBoostAmounts = calculateUserhaiVeloBoosts(users);
  Object.values(users).map(u => {
    if (debug) {
      const prevEarned = u.earned;
      earn(u, rewardPerWeight, finalBoostAmounts);
      if (u.earned !== prevEarned) {
        debugEvents.push({
          type: 'userEarn',
          address: u.address,
          deltaEarned: u.earned - prevEarned,
          totalEarned: u.earned,
          rewardPerWeight,
          boost: finalBoostAmounts[u.address] ?? 1,
          stakingWeight: u.stakingWeight,
          timestamp: endTimestamp
        });
      }
    } else {
      earn(u, rewardPerWeight, finalBoostAmounts);
    }
  });

  if (debug) {
    const totalRewardsDistributed = Object.values(users).reduce((acc, u) => acc + u.earned, 0);
    debugEvents.push({
      type: 'finalSnapshot',
      timestamp: endTimestamp,
      totalRewardsDistributed,
      users: Object.values(users)
        .filter(u => u.earned > 0 || u.collateral > 0)
        .map(u => ({
          address: u.address,
          collateral: u.collateral,
          stakingWeight: u.stakingWeight,
          earned: u.earned,
          boost: finalBoostAmounts[u.address] ?? 1
        }))
        .sort((a, b) => b.earned - a.earned)
    });
  }

  return { users, debugEvents: debug ? debugEvents : undefined };
};

// Credit reward to a user
const earn = (
  user: UserAccount,
  rewardPerWeight: number,
  boostAmounts: BoostAmounts
) => {
  const boostAmount = boostAmounts[user.address] ?? 1;

  // Credit to the user his due rewards

  user.earned +=
    (rewardPerWeight - user.rewardPerWeightStored) *
    user.stakingWeight *
    boostAmount;
  // Store his cumulative credited rewards for next time
  user.rewardPerWeightStored = rewardPerWeight;
};

const sumAllWeights = (users: UserList, boostAmounts: BoostAmounts) => {
  return Object.values(users).reduce((acc, user) => {
    const boostAmount = boostAmounts[user.address] ?? 1;
    return acc + user.stakingWeight * boostAmount;
  }, 0);
};
