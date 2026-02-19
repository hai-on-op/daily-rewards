import { UserList } from "../types";
import {
  getRawHaiveloCollateralData,
  processHaiveloCollateral,
  HaiveloCollateralEvent,
} from "../services/initial-data/getInitialHaiveloState";

import {
  processRewardEvents,
  processCombinedRewardEvents,
  mergeCombinedEvents,
  LpStakingEventRaw,
  ExtendedUserState,
} from "../services/rewards/haiVeloRewardEventProcessor";
import { config } from "../config";
import { haiveloProvider } from "../utils/chain";
import {
  getLpStakingPositions,
  LpStakingPositionEvent,
} from "../services/lp-staking-data";
import {
  loadSyncEventsCache,
  clearSyncEventsCache,
  getClosestSyncEventFromCache,
  calculateHaiVeloPerLp,
  getPoolState,
  SyncEvent,
} from "../services/haivelo-lp-data";

type RewardCalculatorOptions = {
  startBlock: number;
  endBlock: number;
};

/**
 * Extended user state to track collateral and LP staking separately
 * Now tracks RAW LP amounts instead of haiVELO-equivalent
 */
type ExtendedUserStates = Record<string, ExtendedUserState>;

/**
 * Convert LP staking position events to raw LP events format
 */
const convertToRawLpEvents = (
  lpStakingEvents: LpStakingPositionEvent[],
  startTimestamp: number,
  endTimestamp: number
): LpStakingEventRaw[] => {
  // Filter events within the timestamp range and only STAKE/WITHDRAW
  return lpStakingEvents
    .filter((event) => {
      const eventTimestamp = parseInt(event.timestamp);
      return (
        eventTimestamp >= startTimestamp &&
        eventTimestamp <= endTimestamp &&
        (event.type === 'STAKE' || event.type === 'WITHDRAW')
      );
    })
    .map((event) => ({
      id: event.id,
      userAddress: event.user.id.toLowerCase(),
      amount: event.amount,
      timestamp: event.timestamp,
      transactionHash: event.transactionHash,
      type: event.type as 'STAKE' | 'WITHDRAW',
    }));
};

/**
 * Get initial LP staking state before the start block (in RAW LP amounts)
 */
const getInitialLpStakingStateRaw = (
  lpStakingEvents: LpStakingPositionEvent[],
  startTimestamp: number
): Record<string, number> => {
  // Filter events before start timestamp
  const initialEvents = lpStakingEvents.filter((event) => {
    const eventTimestamp = parseInt(event.timestamp);
    return eventTimestamp < startTimestamp;
  });

  // Aggregate initial LP staking positions per user (RAW amounts)
  const userLpStakingRaw: Record<string, number> = {};

  for (const event of initialEvents) {
    if (event.type !== 'STAKE' && event.type !== 'WITHDRAW') {
      continue;
    }

    const userAddress = event.user.id.toLowerCase();
    const lpAmount = Number(event.amount) / 1e18; // Convert from wei

    if (!userLpStakingRaw[userAddress]) {
      userLpStakingRaw[userAddress] = 0;
    }

    if (event.type === 'STAKE') {
      userLpStakingRaw[userAddress] += lpAmount;
    } else if (event.type === 'WITHDRAW') {
      userLpStakingRaw[userAddress] -= lpAmount;
    }

    // Handle dusty amounts
    if (userLpStakingRaw[userAddress] < 0 && userLpStakingRaw[userAddress] > -0.0001) {
      userLpStakingRaw[userAddress] = 0;
    }
  }

  return userLpStakingRaw;
};

/**
 * Get sync events within the time range for price updates
 */
const getSyncEventsInRange = (
  syncEvents: SyncEvent[],
  startTimestamp: number,
  endTimestamp: number
): SyncEvent[] => {
  return syncEvents.filter((event) => {
    const eventTimestamp = parseInt(event.timestamp);
    return eventTimestamp >= startTimestamp && eventTimestamp <= endTimestamp;
  });
};

/**
 * Calculate haiVELO rewards with LP staking integration
 * 
 * Weight calculation:
 * - Collateral: 1 haiVELO = 1 weight
 * - LP staking: LP_staked × (reserve0_haiVELO / totalLPSupply) = haiVELO-equivalent weight
 * 
 * This combines both haiVELO collateral deposits and haiVELO-VELO LP staking
 * into a single reward pool, with proper LP ratio tracking over time.
 */
export const calculateHaiveloRewards = async (
  rewardAmount: number,
  options?: RewardCalculatorOptions
): Promise<UserList> => {
  const REWARD_AMOUNT = rewardAmount;

  const {
    startBlock = config().HAIVELO_START_BLOCK,
    endBlock = config().HAIVELO_END_BLOCK,
  } = options
    ? options
    : {
        startBlock: config().HAIVELO_START_BLOCK,
        endBlock: config().HAIVELO_END_BLOCK,
      };

  console.log(`Calculating haiVELO rewards from block ${startBlock} to ${endBlock}`);

  // Get block timestamps
  const startTimestamp = (await haiveloProvider.getBlock(startBlock)).timestamp;
  const endTimestamp = (await haiveloProvider.getBlock(endBlock)).timestamp;

  // Fetch haiVELO collateral events (if enabled)
  let haiVeloEvents: HaiveloCollateralEvent[] = [];
  if (config().HAIVELO_COLLATERAL_ENABLED) {
    haiVeloEvents = await getRawHaiveloCollateralData();
    console.log(`Fetched ${haiVeloEvents.length} haiVELO collateral events`);
  } else {
    console.log("HAIVELO_COLLATERAL_ENABLED is false, skipping collateral events");
  }

  // Fetch haiVELO-VELO LP staking events and sync events
  let lpStakingEvents: LpStakingPositionEvent[] = [];
  let rawLpEvents: LpStakingEventRaw[] = [];
  let syncEvents: SyncEvent[] = [];
  let totalSupply = BigInt(0);
  let initialHaiVeloPerLp = 0;

  // Check if LP staking integration is enabled AND the LP pool indexer is configured
  if (config().HAIVELO_LP_STAKING_ENABLED && config().HAIVELO_VELO_LP_INDEXER) {
    try {
      // Get the pool state for total supply
      const poolState = await getPoolState();
      if (poolState) {
        totalSupply = BigInt(poolState.totalSupply);

        // Load sync events cache
        const allSyncEvents = await loadSyncEventsCache();
        console.log(`Loaded ${allSyncEvents.length} sync events from pool indexer`);

        // Get sync events within the time range
        syncEvents = getSyncEventsInRange(allSyncEvents, startTimestamp, endTimestamp);
        console.log(`Found ${syncEvents.length} sync events in time range`);

        // Get initial haiVELO per LP ratio (at start of period)
        const initialSyncEvent = getClosestSyncEventFromCache(startTimestamp);
        if (initialSyncEvent) {
          initialHaiVeloPerLp = calculateHaiVeloPerLp(initialSyncEvent, totalSupply);
          console.log(`Initial haiVELO per LP token: ${initialHaiVeloPerLp}`);
        }

        // Fetch LP staking events
        lpStakingEvents = await getLpStakingPositions('HAI_VELO_VELO');
        console.log(`Fetched ${lpStakingEvents.length} haiVELO-VELO LP staking events`);

        // Convert to raw LP events format
        rawLpEvents = convertToRawLpEvents(lpStakingEvents, startTimestamp, endTimestamp);
        console.log(`Converted ${rawLpEvents.length} LP staking events in time range`);

        // Don't clear cache yet - we need it for initial state calculation
      } else {
        console.warn("Could not get pool state, LP staking events will not be processed");
      }
    } catch (error) {
      console.warn("Error fetching LP staking events, continuing with collateral only:", error);
    }
  } else {
    if (!config().HAIVELO_LP_STAKING_ENABLED) {
      console.log("HAIVELO_LP_STAKING_ENABLED is false, skipping LP staking integration");
    } else {
      console.log("HAIVELO_VELO_LP_INDEXER not configured, skipping LP staking integration");
    }
  }

  // Filter collateral events
  const initialCollateralEvents = haiVeloEvents
    .filter((event) => Number(event.createdAtBlock) < startBlock)
    .sort((a, b) => Number(a.createdAtBlock) - Number(b.createdAtBlock));

  const processingCollateralEvents = haiVeloEvents.filter(
    (event) =>
      Number(event.createdAtBlock) >= startBlock &&
      Number(event.createdAtBlock) <= endBlock
  );

  // Process initial collateral state
  const initialHaiveloUsers = processHaiveloCollateral(initialCollateralEvents);

  // If we have LP staking events or sync events, use the combined processor
  if (rawLpEvents.length > 0 || syncEvents.length > 0) {
    console.log("Using combined reward processor with LP staking and price tracking");

    // Get initial LP staking state (RAW amounts)
    const initialLpStakingRaw = getInitialLpStakingStateRaw(lpStakingEvents, startTimestamp);
    console.log(`Initial LP staking state for ${Object.keys(initialLpStakingRaw).length} users`);

    // Build extended user states
    const extendedStates: ExtendedUserStates = {};
    
    // Add initial collateral states
    for (const [address, user] of Object.entries(initialHaiveloUsers)) {
      const rawLpAmount = initialLpStakingRaw[address] || 0;
      extendedStates[address] = {
        collateral: user.collateral,
        lpStakedRaw: rawLpAmount,
      };
      // Update the user's staking weight using initial haiVELO per LP ratio
      const lpHaiVeloEquivalent = rawLpAmount * initialHaiVeloPerLp;
      user.stakingWeight = user.collateral + lpHaiVeloEquivalent;
      user.collateral = user.stakingWeight; // Combined for reward calculation
    }

    // Add users who only have LP staking (no collateral)
    for (const [address, rawLpAmount] of Object.entries(initialLpStakingRaw)) {
      if (!initialHaiveloUsers[address]) {
        const lpHaiVeloEquivalent = rawLpAmount * initialHaiVeloPerLp;
        initialHaiveloUsers[address] = {
          address,
          collateral: lpHaiVeloEquivalent,
          debt: 0,
          lpPositions: [],
          stakingWeight: lpHaiVeloEquivalent,
          rewardPerWeightStored: 0,
          earned: 0,
          totalBridgedTokens: 0,
          usedBridgedTokens: 0,
        };
        extendedStates[address] = {
          collateral: 0,
          lpStakedRaw: rawLpAmount,
        };
      }
    }

    // Clear sync events cache now that we're done with initial state
    clearSyncEventsCache();

    // Merge and sort combined events (collateral, LP staking, and sync/price updates)
    const combinedEvents = mergeCombinedEvents(
      processingCollateralEvents,
      rawLpEvents,
      syncEvents,
      totalSupply
    );
    console.log(`Processing ${combinedEvents.length} combined events (with ${syncEvents.length} price updates)`);

    // Process combined rewards
    const users = await processCombinedRewardEvents(
      REWARD_AMOUNT,
      combinedEvents,
      initialHaiveloUsers,
      extendedStates,
      initialHaiVeloPerLp,
      {
        startBlock,
        endBlock,
      }
    );

    return users;
  }

  // Fall back to original processor if no LP staking events
  console.log("Using original reward processor (no LP staking events)");
  clearSyncEventsCache();

  const { users } = await processRewardEvents(
    REWARD_AMOUNT,
    processingCollateralEvents,
    initialHaiveloUsers,
    {
      startBlock,
      endBlock,
    }
  );

  return users;
};

if (require.main === module) {
  calculateHaiveloRewards(1000).then((rewards) => {
    console.log("rewards");
    console.log(rewards);
  });
}
