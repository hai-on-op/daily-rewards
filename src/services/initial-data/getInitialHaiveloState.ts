import { UserList } from "../../types";
import { subgraphQueryPaginated } from "../subgraph/utils";
import { config } from "../../config";
import { getLpStakingPositions, LpStakingPositionEvent } from "../lp-staking-data";
import {
  loadSyncEventsCache,
  clearSyncEventsCache,
  getClosestSyncEventFromCache,
  calculateLpPriceFromSyncEvent,
  getPoolState,
} from "../haivelo-lp-data";

/**
 * Type definition for raw HAIVELO collateral data from the subgraph
 */
export type HaiveloCollateralEvent = {
  id: string;
  createdAt: string;
  deltaCollateral: string;
  deltaDebt: string;
  safe: {
    id: string;
    owner: {
      id: string;
      address: string;
    };
  };
  collateralType: {
    id: string;
  };
  createdAtTransaction: string;
  createdAtBlock: string;
};

/**
 * Extended initial state that includes LP staking information
 */
export type InitialHaiveloStateWithLpStaking = {
  users: UserList;
  lpStakingByUser: Record<string, number>; // VELO-equivalent LP staking per user
  lpStakingRawByUser: Record<string, number>; // Raw LP token amounts per user
};

/**
 * Builds the GraphQL query to fetch HAIVELO collateral data from the subgraph.
 *
 * @returns {string} The GraphQL query string.
 */
export const buildHaiveloCollateralQuery = (): string => {
  const ids = config().HAIVELO_COLLATERAL_TYPE_IDS;
  const idsList = ids.map(id => `"${id}"`).join(", ");
  return `
    {
      modifySAFECollateralizations(
        where: {
          collateralType_: { id_in: [${idsList}] },
        },
        orderBy: createdAt,
        first: 1000,
        skip: [[skip]]
      ) {
        id
        createdAt
        deltaCollateral
        deltaDebt
        safe {
          id
          owner {
            id
            address
          }
        }
        collateralType {
          id
        }
        createdAtTransaction
        createdAtBlock
      }
    }
  `;
};

/**
 * Fetches HAIVELO collateral data from the subgraph using the provided query.
 *
 * @param {string} query - The GraphQL query string.
 * @returns {Promise<any[]>} A promise that resolves to an array of HAIVELO collateral data.
 */
export const fetchHaiveloCollateral = async (query: string): Promise<any[]> => {
  return await subgraphQueryPaginated(
    query,
    "modifySAFECollateralizations",
    config().HAIVELO_SUBGRAPH_URL
  );
};

/**
 * Processes raw HAIVELO collateral data into a structured format grouped by user.
 *
 * @param {any[]} collateralData - An array of raw HAIVELO collateral data.
 * @returns {UserList} An object mapping user addresses to their collateral amounts.
 */
export const processHaiveloCollateral = (
  collateralData: HaiveloCollateralEvent[]
): UserList => {
  return collateralData.reduce((acc, data) => {
    const userAddress = data.safe.owner.address;
    const collateralAmount = Number(data.deltaCollateral);

    if (acc[userAddress]) {
      acc[userAddress].collateral += collateralAmount;
      acc[userAddress].stakingWeight = acc[userAddress].collateral;

      if (acc[userAddress].collateral < 0 && acc[userAddress].collateral > -0.4) {
        acc[userAddress].collateral = 0;
        acc[userAddress].stakingWeight = acc[userAddress].collateral;
      }
    } else {
      acc[userAddress] = {
        address: userAddress,
        collateral: collateralAmount,
        debt: 0,
        lpPositions: [],
        stakingWeight: collateralAmount,
        rewardPerWeightStored: 0,
        earned: 0,
        totalBridgedTokens: 0,
        usedBridgedTokens: 0,
      };
    }

    return acc;
  }, {} as UserList);
};

/**
 * Fetches and returns raw HAIVELO collateral data from the subgraph.
 *
 * @returns {Promise<RawHaiveloCollateral[]>} A promise that resolves to an array of raw HAIVELO collateral data.
 */
export const getRawHaiveloCollateralData = async (): Promise<
  HaiveloCollateralEvent[]
> => {
  // Build the query
  const query = buildHaiveloCollateralQuery();

  // Fetch collateral data
  const rawCollateralData = await fetchHaiveloCollateral(query);

  return rawCollateralData as HaiveloCollateralEvent[];
};

/**
 * Retrieves and processes initial HAIVELO collateral data from the subgraph.
 *
 * @returns {Promise<UserList>} A promise that resolves to mapping of users to their HAIVELO collateral.
 */
export const getInitialHaiveloState = async (): Promise<UserList> => {
  // Build the query
  const query = buildHaiveloCollateralQuery();

  // Fetch collateral data
  const rawCollateralData = await fetchHaiveloCollateral(query);

  // Process collateral data
  const userCollateral = processHaiveloCollateral(rawCollateralData);

  return userCollateral;
};

/**
 * Calculate LP staking amounts in RAW LP tokens for all users before a given timestamp
 * 
 * @param beforeTimestamp - Unix timestamp to calculate state at
 * @returns Record mapping user addresses to their raw LP token amounts
 */
export const getInitialLpStakingRaw = async (
  beforeTimestamp: number
): Promise<Record<string, number>> => {
  // Check if LP pool indexer is configured
  if (!config().HAIVELO_VELO_LP_INDEXER) {
    console.log("HAIVELO_VELO_LP_INDEXER not configured, returning empty LP staking state");
    return {};
  }

  try {
    // Fetch all LP staking events
    const lpStakingEvents = await getLpStakingPositions('HAI_VELO_VELO');

    // Filter events before the timestamp
    const initialEvents = lpStakingEvents.filter((event) => {
      const eventTimestamp = parseInt(event.timestamp);
      return eventTimestamp < beforeTimestamp;
    });

    // Aggregate LP staking positions per user in RAW amounts
    const userLpStakingRaw: Record<string, number> = {};

    for (const event of initialEvents) {
      if (event.type !== 'STAKE' && event.type !== 'WITHDRAW') {
        continue;
      }

      const userAddress = event.user.id.toLowerCase();
      const lpAmount = Number(event.amount) / 1e18;

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
  } catch (error) {
    console.error("Error getting initial LP staking state:", error);
    return {};
  }
};

/**
 * Calculate LP staking amounts in VELO-equivalent for all users before a given timestamp
 * 
 * @param beforeTimestamp - Unix timestamp to calculate state at
 * @returns Record mapping user addresses to their LP staking in VELO-equivalent
 */
export const getInitialLpStakingInVelo = async (
  beforeTimestamp: number
): Promise<Record<string, number>> => {
  // Check if LP pool indexer is configured
  if (!config().HAIVELO_VELO_LP_INDEXER) {
    console.log("HAIVELO_VELO_LP_INDEXER not configured, returning empty LP staking state");
    return {};
  }

  try {
    // Get the pool state for total supply
    const poolState = await getPoolState();
    if (!poolState) {
      console.warn("Could not get pool state for initial LP staking state");
      return {};
    }

    const totalSupply = BigInt(poolState.totalSupply);

    // Load sync events cache
    await loadSyncEventsCache();

    // Fetch all LP staking events
    const lpStakingEvents = await getLpStakingPositions('HAI_VELO_VELO');

    // Filter events before the timestamp
    const initialEvents = lpStakingEvents.filter((event) => {
      const eventTimestamp = parseInt(event.timestamp);
      return eventTimestamp < beforeTimestamp;
    });

    // Aggregate LP staking positions per user in VELO-equivalent
    const userLpStaking: Record<string, number> = {};

    for (const event of initialEvents) {
      if (event.type !== 'STAKE' && event.type !== 'WITHDRAW') {
        continue;
      }

      const userAddress = event.user.id.toLowerCase();
      const eventTimestamp = parseInt(event.timestamp);

      // Get LP price at event time
      const syncEvent = getClosestSyncEventFromCache(eventTimestamp);
      if (!syncEvent) continue;

      const lpPriceInVelo = calculateLpPriceFromSyncEvent(syncEvent, totalSupply);
      const lpAmount = Number(event.amount) / 1e18;
      const veloEquivalent = lpAmount * lpPriceInVelo;

      if (!userLpStaking[userAddress]) {
        userLpStaking[userAddress] = 0;
      }

      if (event.type === 'STAKE') {
        userLpStaking[userAddress] += veloEquivalent;
      } else if (event.type === 'WITHDRAW') {
        userLpStaking[userAddress] -= veloEquivalent;
      }

      // Handle dusty amounts
      if (userLpStaking[userAddress] < 0 && userLpStaking[userAddress] > -0.0001) {
        userLpStaking[userAddress] = 0;
      }
    }

    // Clear cache when done
    clearSyncEventsCache();

    return userLpStaking;
  } catch (error) {
    console.error("Error getting initial LP staking state:", error);
    return {};
  }
};

/**
 * Get combined initial state including both collateral and LP staking
 * 
 * @param beforeTimestamp - Unix timestamp to calculate state at
 * @returns Combined initial state with users and LP staking breakdown
 */
export const getInitialHaiveloStateWithLpStaking = async (
  beforeTimestamp: number
): Promise<InitialHaiveloStateWithLpStaking> => {
  // Get raw collateral data
  const rawCollateralData = await getRawHaiveloCollateralData();

  // Filter to events before the timestamp
  const filteredCollateralData = rawCollateralData.filter(
    (event) => Number(event.createdAt) < beforeTimestamp
  );

  // Process collateral data
  const users = processHaiveloCollateral(filteredCollateralData);

  // Get LP staking data
  const lpStakingByUser = await getInitialLpStakingInVelo(beforeTimestamp);

  // Merge LP staking into user state
  for (const [address, lpStaked] of Object.entries(lpStakingByUser)) {
    if (users[address]) {
      // User has both collateral and LP staking
      users[address].stakingWeight = users[address].collateral + lpStaked;
    } else {
      // User only has LP staking
      users[address] = {
        address,
        collateral: lpStaked, // Store combined value in collateral for reward calc
        debt: 0,
        lpPositions: [],
        stakingWeight: lpStaked,
        rewardPerWeightStored: 0,
        earned: 0,
        totalBridgedTokens: 0,
        usedBridgedTokens: 0,
      };
    }
  }

  // Also get raw LP amounts
  const lpStakingRawByUser = await getInitialLpStakingRaw(beforeTimestamp);

  return {
    users,
    lpStakingByUser,
    lpStakingRawByUser,
  };
};

// For testing purposes
if (require.main === module) {
  (async () => {
    try {
      console.log("Getting initial haiVELO state...");
      const state = await getInitialHaiveloState();
      console.log(`Found ${Object.keys(state).length} users with haiVELO collateral`);

      // Show top users
      const sortedUsers = Object.entries(state)
        .sort(([, a], [, b]) => b.collateral - a.collateral)
        .slice(0, 5);

      console.log("\nTop 5 haiVELO collateral holders:");
      sortedUsers.forEach(([address, user], index) => {
        console.log(`${index + 1}. ${address}: ${user.collateral.toFixed(4)} VELO-equivalent`);
      });

      // Test LP staking state
      const currentTimestamp = Math.floor(Date.now() / 1000);
      console.log("\nGetting initial LP staking state...");
      const lpStaking = await getInitialLpStakingInVelo(currentTimestamp);
      console.log(`Found ${Object.keys(lpStaking).length} users with LP staking`);

      const sortedLpUsers = Object.entries(lpStaking)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

      console.log("\nTop 5 LP stakers (VELO-equivalent):");
      sortedLpUsers.forEach(([address, amount], index) => {
        console.log(`${index + 1}. ${address}: ${amount.toFixed(4)} VELO-equivalent`);
      });
    } catch (error) {
      console.error("Error:", error);
    }
  })();
}
