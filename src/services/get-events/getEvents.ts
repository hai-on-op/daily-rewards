import { config } from "../../config";
import { subgraphQueryPaginated } from "../subgraph/utils";
import { RewardEvent, RewardEventType } from "../../types";
import { getExclusionList } from "../../utils/getExclusionList";
import { NULL_ADDRESS } from "../../config/constants";
import { blockToTimestamp } from "../../utils/chain";

type GetEventsConfig = {
  type: "LP_REWARDS" | "MINTER_REWARDS";
  startBlock: number;
  endBlock: number;
  owners: Map<string, string>;
  cType?: string;
};

export const getEvents = async ({
  type,
  startBlock,
  endBlock,
  owners,
  cType,
}: GetEventsConfig): Promise<RewardEvent[]> => {
  console.log(`Fetching ${type} events...`);

  // Execute event fetchers based on type
  const events =
    type === "LP_REWARDS"
      ? await getLPRewardEvents({ startBlock, endBlock, owners, type })
      : await getMinterRewardEvents({
          startBlock,
          endBlock,
          owners,
          type,
          cType,
        });

  // Filter excluded addresses
  const exclusionList = await getExclusionList(config().EXCLUSION_LIST_FILE);
  const filteredEvents = events.filter(
    (e) => !e.address || !exclusionList.includes(e.address)
  );

  // Sort by timestamp and logIndex
  const sortedEvents = filteredEvents.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.logIndex - b.logIndex;
  });

  console.log(`Fetched a total of ${sortedEvents.length} events`);

  validateEvents(sortedEvents);

  return sortedEvents;
};

const getLPRewardEvents = async ({
  startBlock,
  endBlock,
  owners,
  type,
}: Omit<GetEventsConfig, "cType">): Promise<RewardEvent[]> => {
  const eventPromises = [
    getSafeModificationEvents({ startBlock, endBlock, owners, type }),
    getPoolPositionEvents({ startBlock, endBlock, owners, type }),
    getPoolSwap({ startBlock, endBlock, owners, type }),
    getUpdateAccumulatedRateEvent({ startBlock, endBlock, owners, type }),
  ];

  return (await Promise.all(eventPromises)).flat();
};

const getMinterRewardEvents = async ({
  startBlock,
  endBlock,
  owners,
  type,
  cType,
}: GetEventsConfig): Promise<RewardEvent[]> => {
  if (!cType) {
    throw new Error("cType is required for MINTER_REWARDS");
  }

  const eventPromises = [
    getSafeModificationEvents({ startBlock, endBlock, owners, type, cType }),
    getUpdateAccumulatedRateEvent({
      startBlock,
      endBlock,
      owners,
      type,
      cType,
    }),
  ];

  return (await Promise.all(eventPromises)).flat();
};

const validateEvents = (events: RewardEvent[]): void => {
  for (const event of events) {
    if (
      !event ||
      event.logIndex === undefined ||
      !event.timestamp ||
      event.type === undefined ||
      event.value === undefined
    ) {
      throw Error(`Inconsistent event: ${JSON.stringify(event)}`);
    }

    if (
      event.type === RewardEventType.POOL_POSITION_UPDATE ||
      event.type === RewardEventType.DELTA_DEBT
    ) {
      if (!event.address) {
        throw Error(`Missing address for event: ${JSON.stringify(event)}`);
      }
    } else if (event.address) {
      throw Error(`Unexpected address for event: ${JSON.stringify(event)}`);
    }
  }
};

export interface Position {
  id: string;
  owner: string;
  liquidity: string;
  tickLower: { tickIdx: string };
  tickUpper: { tickIdx: string };
  createdAt: string;
  createdAtBlock: string;
}

const getPoolPositionEvents = async ({
  startBlock,
  endBlock,
}: GetEventsConfig): Promise<RewardEvent[]> => {
  const query = `{
    positionSnapshots(
      where: {
        blockNumber_gte: ${startBlock}, 
        blockNumber_lte: ${endBlock}, 
        pool: "${config().UNISWAP_POOL_ADDRESS}"
      }, 
      first: 1000, 
      skip: [[skip]]
    ) {
      owner
      timestamp
      liquidity
      blockNumber
      position {
        id
        tickLower {
          tickIdx
        }
        tickUpper {
          tickIdx
        }
      }
    }
  }`;

  interface PositionSnapshot {
    owner: string;
    timestamp: string;
    liquidity: string;
    blockNumber: string;
    position: {
      id: string;
      tickLower: {
        tickIdx: string;
      };
      tickUpper: {
        tickIdx: string;
      };
    };
  }

  const snapshots: PositionSnapshot[] = await subgraphQueryPaginated(
    query,
    "positionSnapshots",
    config().UNISWAP_SUBGRAPH_URL
  );

  const events: RewardEvent[] = snapshots.map((position) => ({
    type: RewardEventType.POOL_POSITION_UPDATE,
    value: {
      tokenId: Number(position.position.id),
      upperTick: Number(position.position.tickUpper.tickIdx),
      lowerTick: Number(position.position.tickLower.tickIdx),
      liquidity: Number(position.liquidity),
    },
    address: position.owner,
    logIndex: 1e6,
    timestamp: Number(position.timestamp),
    createdAtBlock: Number(position.blockNumber), // Add this field
  }));

  console.log(`  Fetched ${events.length} position update events`);
  return events;
};

const getSafeModificationEvents = async ({
  startBlock,
  endBlock,
  owners,
  type,
  cType,
}: GetEventsConfig): Promise<RewardEvent[]> => {
  // Only require cType for MINTER_REWARDS
  if (type === "MINTER_REWARDS" && !cType) {
    throw new Error("cType is required for MINTER_REWARDS");
  }

  const collateralFilter =
    type === "MINTER_REWARDS" && cType ? `, collateralType: "${cType}"` : "";

  type SubgraphSafeModification = {
    id: string;
    deltaDebt: string;
    deltaCollateral: string;
    createdAt: string;
    createdAtBlock: string;
    safeHandler: string;
    collateralType?: {
      id: string;
    };
  };

  // Main event to modify a safe
  const safeModificationQuery = `{
    modifySAFECollateralizations(
      where: {
        createdAtBlock_gte: ${startBlock}, 
        collateralType: "${cType}", 
        createdAtBlock_lte: ${endBlock}, 
        deltaDebt_not: 0
      }, 
      first: 1000, 
      skip: [[skip]]
    ) {
      id
      deltaDebt
      deltaCollateral
      safeHandler
      createdAt
      createdAtBlock
      collateralType {
        id
      }
    }
  }`;

  const safeModifications: SubgraphSafeModification[] =
    await subgraphQueryPaginated(
      safeModificationQuery,
      "modifySAFECollateralizations",
      config().GEB_SUBGRAPH_URL
    );

  // Event used in liquidation
  const confiscateSAFECollateralAndDebtsQuery = `{
    confiscateSAFECollateralAndDebts(
      where: {
        createdAtBlock_gte: ${startBlock}, 
        collateralType: "${cType}", 
        createdAtBlock_lte: ${endBlock}, 
        deltaDebt_not: 0
      }, 
      first: 1000, 
      skip: [[skip]]
    ) {
      id
      deltaDebt
      deltaCollateral
      safeHandler
      createdAt
      createdAtBlock
      collateralType {
        id
      }
    }
  }`;

  const confiscateSAFECollateralAndDebts: SubgraphSafeModification[] =
    await subgraphQueryPaginated(
      confiscateSAFECollateralAndDebtsQuery,
      "confiscateSAFECollateralAndDebts",
      config().GEB_SUBGRAPH_URL
    );

  // Event transferring debt
  const transferSAFECollateralAndDebtsQuery = `{
    transferSAFECollateralAndDebts(
      where: {
        createdAtBlock_gte: ${startBlock}, 
        collateralType: "${cType}", 
        createdAtBlock_lte: ${endBlock}, 
        deltaDebt_not: 0
      }, 
      first: 1000, 
      skip: [[skip]]
    ) {
      id
      deltaDebt
      deltaCollateral
      createdAt
      createdAtBlock
      srcHandler
      dstHandler
      collateralType {
        id
      }
    }
  }`;

  type TransferSAFEEvent = {
    id: string;
    deltaDebt: string;
    deltaCollateral: string;
    createdAt: string;
    createdAtBlock: string;
    srcHandler: string;
    dstHandler: string;
    collateralType: {
      id: string;
    };
  };

  const transferSAFECollateralAndDebts: TransferSAFEEvent[] =
    await subgraphQueryPaginated(
      transferSAFECollateralAndDebtsQuery,
      "transferSAFECollateralAndDebts",
      config().GEB_SUBGRAPH_URL
    );

  const transferSAFECollateralAndDebtsProcessed: SubgraphSafeModification[] =
    transferSAFECollateralAndDebts.flatMap((t) => [
      {
        id: t.id,
        deltaDebt: t.deltaDebt,
        deltaCollateral: t.deltaCollateral,
        safeHandler: t.dstHandler,
        createdAt: t.createdAt,
        createdAtBlock: t.createdAtBlock,
        collateralType: t.collateralType,
      },
      {
        id: t.id,
        deltaDebt: (-1 * Number(t.deltaDebt)).toString(),
        deltaCollateral: (-1 * Number(t.deltaCollateral)).toString(),
        safeHandler: t.srcHandler,
        createdAt: t.createdAt,
        createdAtBlock: t.createdAtBlock,
        collateralType: t.collateralType,
      },
    ]);

  // Merge all modifications
  const allModifications = [
    ...safeModifications,
    ...confiscateSAFECollateralAndDebts,
    ...transferSAFECollateralAndDebtsProcessed,
  ];

  const events: RewardEvent[] = allModifications
    .filter((u) => owners.has(u.safeHandler))
    .map((u) => ({
      type: RewardEventType.DELTA_DEBT,
      value: Number(u.deltaDebt),
      complementaryValue: Number(u.deltaCollateral),
      address: owners.get(u.safeHandler)!,
      logIndex: getLogIndexFromId(u.id),
      timestamp: Number(u.createdAt),
      createdAtBlock: Number(u.createdAtBlock),
      cType: u.collateralType?.id,
    }));

  console.log(
    `  Fetched ${events.length} safe modifications events including ${safeModifications.length} standard safe modification, ${confiscateSAFECollateralAndDebts.length} safe confiscations, ${transferSAFECollateralAndDebts.length} transfer safe debt`
  );

  return events;
};

const getUpdateAccumulatedRateEvent = async ({
  startBlock,
  endBlock,
  cType,
}: GetEventsConfig): Promise<RewardEvent[]> => {
  if (!cType) throw new Error("cType is required for MINTER_REWARDS");

  type AccumulatedRateEvent = {
    id: string;
    rateMultiplier: string;
    createdAt: string;
    createdAtBlock: string;
    collateralType: {
      id: string;
    };
  };

  const query = `{
    updateAccumulatedRates(
      orderBy: accumulatedRate, 
      orderDirection: desc 
      where: {
        createdAtBlock_gte: ${startBlock}, 
        collateralType: "${cType}", 
        createdAtBlock_lte: ${endBlock}
      }, 
      first: 1000, 
      skip: [[skip]]
    ) {
      id
      rateMultiplier
      createdAt
      createdAtBlock
      collateralType {
        id
      }
    }
  }`;

  const data: AccumulatedRateEvent[] = await subgraphQueryPaginated(
    query,
    "updateAccumulatedRates",
    config().GEB_SUBGRAPH_URL
  );

  const events = data.map((x) => ({
    type: RewardEventType.UPDATE_ACCUMULATED_RATE,
    cType: x.collateralType.id,
    value: Number(x.rateMultiplier),
    logIndex: getLogIndexFromId(x.id),
    timestamp: Number(x.createdAt),
    createdAtBlock: Number(x.createdAtBlock),
  }));

  console.log(`  Fetched ${events.length} accumulated rate events`);
  return events;
};

const getLogIndexFromId = (id: string): number => {
  const matches = id.split("-");
  if (matches.length < 2 || isNaN(Number(matches[1]))) {
    throw Error("Invalid log index");
  }
  return Number(matches[1]);
};

const getPoolSwap = async ({
  startBlock,
  endBlock,
}: GetEventsConfig): Promise<RewardEvent[]> => {
  const [startTime, endTime] = await Promise.all([
    blockToTimestamp(startBlock),
    blockToTimestamp(endBlock),
  ]);

  const query = `{
    swaps(
      where: {
        pool: "${config().UNISWAP_POOL_ADDRESS}",
        timestamp_gte: ${startTime},
        timestamp_lte: ${endTime}
      },
      first: 1000,
      skip: [[skip]]
    ) {
      sqrtPriceX96
      timestamp
      logIndex
      transaction {
        blockNumber
      }
    }
  }`;

  interface Swap {
    sqrtPriceX96: string;
    timestamp: string;
    logIndex: string;
    transaction: {
      blockNumber: string;
    };
  }

  const data: Swap[] = await subgraphQueryPaginated(
    query,
    "swaps",
    config().UNISWAP_SUBGRAPH_URL
  );

  const events = data.map((x) => ({
    type: RewardEventType.POOL_SWAP,
    value: Number(x.sqrtPriceX96),
    logIndex: Number(x.logIndex),
    timestamp: Number(x.timestamp),
    createdAtBlock: Number(x.transaction.blockNumber), // Add this field
  }));

  console.log(`  Fetched ${events.length} Uniswap swap events`);
  return events;
};
