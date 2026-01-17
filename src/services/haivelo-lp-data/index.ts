import { subgraphQueryPaginated, subgraphQuery } from "../subgraph/utils";
import { config } from "../../config";

/**
 * Pool state from the indexer
 */
export type PoolState = {
  id: string;
  address: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  updatedAt: string;
};

/**
 * Sync event from the pool indexer - tracks reserve updates
 */
export type SyncEvent = {
  id: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  timestamp: string;
  reserve0: string;
  reserve1: string;
};

/**
 * Build query for fetching sync events from the pool indexer
 * Note: Uses Subsquid syntax (limit/offset) instead of The Graph syntax (first/skip)
 */
const buildSyncEventsQuery = (): string => `
  {
    syncEvents(limit: 1000, offset: [[skip]], orderBy: blockNumber_ASC) {
      id
      txHash
      blockNumber
      logIndex
      timestamp
      reserve0
      reserve1
    }
  }
`;

/**
 * Build query for fetching pool state
 * Note: Uses Subsquid syntax (limit) instead of The Graph syntax (first)
 */
const buildPoolQuery = (): string => `
  {
    pools(limit: 1) {
      id
      address
      token0
      token1
      reserve0
      reserve1
      totalSupply
      updatedAt
    }
  }
`;

/**
 * Build query for fetching sync events up to a specific block
 * Note: Uses Subsquid syntax (limit) instead of The Graph syntax (first)
 */
const buildSyncEventsBeforeBlockQuery = (blockNumber: number): string => `
  {
    syncEvents(
      limit: 1,
      orderBy: blockNumber_DESC,
      where: { blockNumber_lte: ${blockNumber} }
    ) {
      id
      txHash
      blockNumber
      logIndex
      timestamp
      reserve0
      reserve1
    }
  }
`;

/**
 * Fetch all sync events from the haiVELO-VELO LP pool indexer
 */
export const getAllSyncEvents = async (): Promise<SyncEvent[]> => {
  const query = buildSyncEventsQuery();
  const indexerUrl = config().HAIVELO_VELO_LP_INDEXER;

  if (!indexerUrl) {
    console.warn("HAIVELO_VELO_LP_INDEXER not configured, returning empty sync events");
    return [];
  }

  const events = await subgraphQueryPaginated(
    query,
    "syncEvents",
    indexerUrl
  ) as SyncEvent[];

  return events;
};

/**
 * Get the pool state (current reserves and total supply)
 */
export const getPoolState = async (): Promise<PoolState | null> => {
  const query = buildPoolQuery();
  const indexerUrl = config().HAIVELO_VELO_LP_INDEXER;

  if (!indexerUrl) {
    console.warn("HAIVELO_VELO_LP_INDEXER not configured, returning null pool state");
    return null;
  }

  const result = await subgraphQuery(query, indexerUrl);
  return result.pools?.[0] || null;
};

/**
 * Get the closest sync event at or before a specific block number
 */
export const getClosestSyncEventAtBlock = async (
  blockNumber: number
): Promise<SyncEvent | null> => {
  const query = buildSyncEventsBeforeBlockQuery(blockNumber);
  const indexerUrl = config().HAIVELO_VELO_LP_INDEXER;

  if (!indexerUrl) {
    console.warn("HAIVELO_VELO_LP_INDEXER not configured, returning null sync event");
    return null;
  }

  const result = await subgraphQuery(query, indexerUrl);
  return result.syncEvents?.[0] || null;
};

/**
 * Calculate haiVELO per LP token at a specific block
 * 
 * For the haiVELO-VELO pool (token0=haiVELO, token1=VELO):
 * - haiVELO per LP = reserve0 (haiVELO) / totalSupply
 * 
 * This gives the amount of haiVELO represented by 1 LP token.
 * 
 * @param blockNumber - The block number to calculate at
 * @param totalSupply - The total supply of LP tokens at that block
 * @returns haiVELO per LP token (as a number)
 */
export const getHaiVeloPerLpAtBlock = async (
  blockNumber: number,
  totalSupply: bigint
): Promise<number> => {
  const syncEvent = await getClosestSyncEventAtBlock(blockNumber);

  if (!syncEvent) {
    console.warn(`No sync event found at or before block ${blockNumber}`);
    return 0;
  }

  const reserve0 = BigInt(syncEvent.reserve0); // haiVELO reserve

  if (totalSupply === BigInt(0)) {
    return 0;
  }

  // haiVELO per LP = reserve0 / totalSupply
  // We use high precision calculation to avoid precision loss
  const haiVeloPerLp = (reserve0 * BigInt(1e18)) / totalSupply;

  return Number(haiVeloPerLp) / 1e18;
};

/**
 * Calculate haiVELO per LP token using sync event directly
 * 
 * Formula: haiVELO per LP = reserve0 (haiVELO) / totalSupply
 * 
 * This is useful when you already have the sync event and total supply
 */
export const calculateHaiVeloPerLp = (
  syncEvent: SyncEvent,
  totalSupply: bigint
): number => {
  if (totalSupply === BigInt(0)) {
    return 0;
  }

  const reserve0 = BigInt(syncEvent.reserve0); // haiVELO reserve

  // haiVELO per LP = reserve0 / totalSupply
  const haiVeloPerLp = (reserve0 * BigInt(1e18)) / totalSupply;

  return Number(haiVeloPerLp) / 1e18;
};

// Legacy alias for backward compatibility
export const calculateLpPriceFromSyncEvent = calculateHaiVeloPerLp;

/**
 * Cache sync events in memory for efficient lookups during reward calculation
 */
let syncEventsCache: SyncEvent[] | null = null;
let syncEventsCacheByTimestamp: SyncEvent[] | null = null;

/**
 * Load and cache all sync events (call once at the start of reward calculation)
 */
export const loadSyncEventsCache = async (): Promise<SyncEvent[]> => {
  if (syncEventsCache === null) {
    syncEventsCache = await getAllSyncEvents();
    // Sort by block number ascending
    syncEventsCache.sort((a, b) => a.blockNumber - b.blockNumber);
    // Also create a timestamp-sorted cache
    syncEventsCacheByTimestamp = [...syncEventsCache].sort(
      (a, b) => parseInt(a.timestamp) - parseInt(b.timestamp)
    );
  }
  return syncEventsCache;
};

/**
 * Clear the sync events cache (call when done with reward calculation)
 */
export const clearSyncEventsCache = (): void => {
  syncEventsCache = null;
  syncEventsCacheByTimestamp = null;
};

/**
 * Get the closest sync event from the cache at or before a specific timestamp
 * More efficient than querying the indexer for each event
 */
export const getClosestSyncEventFromCache = (
  timestamp: number
): SyncEvent | null => {
  // Use timestamp-based cache since LP staking events use timestamps
  if (!syncEventsCacheByTimestamp || syncEventsCacheByTimestamp.length === 0) {
    return null;
  }

  // Binary search for the closest event at or before the timestamp
  let left = 0;
  let right = syncEventsCacheByTimestamp.length - 1;
  let result: SyncEvent | null = null;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const event = syncEventsCacheByTimestamp[mid];
    const eventTimestamp = parseInt(event.timestamp);

    if (eventTimestamp <= timestamp) {
      result = event;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
};

/**
 * Get the closest sync event from the cache at or before a specific block number
 */
export const getClosestSyncEventFromCacheByBlock = (
  blockNumber: number
): SyncEvent | null => {
  if (!syncEventsCache || syncEventsCache.length === 0) {
    return null;
  }

  // Binary search for the closest event at or before the block
  let left = 0;
  let right = syncEventsCache.length - 1;
  let result: SyncEvent | null = null;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const event = syncEventsCache[mid];

    if (event.blockNumber <= blockNumber) {
      result = event;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
};

/**
 * Calculate haiVELO per LP using the cached sync events (by block number)
 */
export const getHaiVeloPerLpFromCache = (
  blockNumber: number,
  totalSupply: bigint
): number => {
  const syncEvent = getClosestSyncEventFromCacheByBlock(blockNumber);

  if (!syncEvent) {
    return 0;
  }

  return calculateHaiVeloPerLp(syncEvent, totalSupply);
};

/**
 * Calculate haiVELO per LP using the cached sync events (by timestamp)
 */
export const getHaiVeloPerLpFromCacheByTimestamp = (
  timestamp: number,
  totalSupply: bigint
): number => {
  const syncEvent = getClosestSyncEventFromCache(timestamp);

  if (!syncEvent) {
    return 0;
  }

  return calculateHaiVeloPerLp(syncEvent, totalSupply);
};

// For testing purposes
if (require.main === module) {
  (async () => {
    try {
      console.log("Fetching haiVELO-VELO LP pool state...");
      const poolState = await getPoolState();
      console.log("Pool state:", poolState);

      console.log("\nFetching sync events...");
      const syncEvents = await getAllSyncEvents();
      console.log(`Found ${syncEvents.length} sync events`);

      if (syncEvents.length > 0) {
        const latestEvent = syncEvents[syncEvents.length - 1];
        console.log("\nLatest sync event:", latestEvent);

        if (poolState) {
          const totalSupply = BigInt(poolState.totalSupply);
          const haiVeloPerLp = calculateHaiVeloPerLp(latestEvent, totalSupply);
          console.log(`\nhaiVELO per LP token: ${haiVeloPerLp}`);
        }
      }
    } catch (error) {
      console.error("Error:", error);
    }
  })();
}
