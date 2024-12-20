import { config } from "../../config";
import { subgraphQueryPaginated } from "../subgraph/utils";
import { LPRewardEvent, RewardEventType } from "../../types";
import { getExclusionList } from "../../utils/getExclusionList";
import { providers } from "ethers";
import { lpProvider } from "../../utils/chain";

export const blockToTimestamp = async (block: number) => {
  return (await lpProvider.getBlock(block)).timestamp;
};



export const getEvents = async (
  startBlock: number,
  endBlock: number,
  owners: Map<string, string>
) => {
  console.log(`Fetch events ...`);

  const res = await Promise.all([
    getSafeModificationEvents(startBlock, endBlock, owners),
    getPoolPositionUpdate(startBlock, endBlock),
    getPoolSwap(startBlock, endBlock),
    getUpdateAccumulatedRateEvent(startBlock, endBlock),
  ]);

  // Merge all events
  let events = res.reduce((a, b) => a.concat(b), []);

  // Filter out events involving the exclusion list
  // Remove accounts from the exclusion list
  const exclusionList = await getExclusionList(config().EXCLUSION_LIST_FILE);
  events = events.filter(
    (e) => !e.address || !exclusionList.includes(e.address)
  );

  // Sort first by timestamp then by logIndex
  events = events.sort((a, b) => {
    if (a.timestamp > b.timestamp) {
      return 1;
    } else if (a.timestamp < b.timestamp) {
      return -1;
    } else {
      if (a.logIndex > b.logIndex) {
        return 1;
      } else {
        return -1;
      }
    }
  });

  console.log(`Fetched a total of ${events.length} events`);

  // Sanity checks
  for (let e of events) {
    if (
      !e ||
      e.logIndex == undefined ||
      !e.timestamp ||
      e.type == undefined ||
      !e.value == undefined
    ) {
      throw Error(`Inconsistent event: ${JSON.stringify(e)}`);
    }

    if (
      e.type === RewardEventType.POOL_POSITION_UPDATE ||
      // @ts-ignore
      e.type === RewardEventType.DELTA_DEBT
    ) {
      if (!e.address) {
        throw Error(`Inconsistent event: ${JSON.stringify(e)}`);
      }
    } else {
      if (e.address) {
        throw Error(`Inconsistent event: ${JSON.stringify(e)}`);
      }
    }
  }

  return events;
};

export const getSafeModificationEvents = async (
  start: number,
  end: number,
  ownerMapping: Map<string, string>
): Promise<LPRewardEvent[]> => {
  // We several kind of modifications

  type SubgraphSafeModification = {
    id: string;
    deltaDebt: string;
    createdAt: string;
    safeHandler: string;
    collateralType?: {
      id: string;
    };
  };

  // Main event to modify a safe
  const safeModificationQuery = `{
        modifySAFECollateralizations(where: {createdAtBlock_gte: ${start}, createdAtBlock_lte: ${end}, deltaDebt_not: 0}, first: 1000, skip: [[skip]]) {
          id
          deltaDebt
          safeHandler
          createdAt
          collateralType {
            id
          }
        }
      }`;

  const safeModifications: SubgraphSafeModification[] =
    await subgraphQueryPaginated(
      safeModificationQuery,
      "modifySAFECollateralizations",
      config().LP_GEB_SUBGRAPH_URL
    );

  // Event used in liquidation
  const confiscateSAFECollateralAndDebtsQuery = `{
      confiscateSAFECollateralAndDebts(where: {createdAtBlock_gte: ${start}, createdAtBlock_lte: ${end}, deltaDebt_not: 0}, first: 1000, skip: [[skip]]) {
        id
        deltaDebt
        safeHandler
        createdAt
        collateralType {
          id
        }
      }
    }`;

  const confiscateSAFECollateralAndDebts: SubgraphSafeModification[] =
    await subgraphQueryPaginated(
      confiscateSAFECollateralAndDebtsQuery,
      "confiscateSAFECollateralAndDebts",
      config().LP_GEB_SUBGRAPH_URL
    );

  // Event transferring debt, rarely used
  const transferSAFECollateralAndDebtsQuery = `{
      transferSAFECollateralAndDebts(where: {createdAtBlock_gte: ${start}, createdAtBlock_lte: ${end}, deltaDebt_not: 0}, first: 1000, skip: [[skip]]) {
        id
        deltaDebt
        createdAt
        srcHandler
        dstHandler
        collateralType {
          id
        }
      }
    }`;

  const transferSAFECollateralAndDebts: {
    id: string;
    deltaDebt: string;
    createdAt: string;
    srcHandler: string;
    dstHandler: string;
  }[] = await subgraphQueryPaginated(
    transferSAFECollateralAndDebtsQuery,
    "transferSAFECollateralAndDebts",
    config().LP_GEB_SUBGRAPH_URL
  );

  const transferSAFECollateralAndDebtsProcessed: SubgraphSafeModification[] =
    [];
  for (let t of transferSAFECollateralAndDebts) {
    transferSAFECollateralAndDebtsProcessed.push({
      id: t.id,
      deltaDebt: t.deltaDebt,
      safeHandler: t.dstHandler,
      createdAt: t.createdAt,
    });

    transferSAFECollateralAndDebtsProcessed.push({
      id: t.id,
      deltaDebt: (-1 * Number(t.deltaDebt)).toString(),
      safeHandler: t.srcHandler,
      createdAt: t.createdAt,
    });
  }

  // Merge all the different kind of modifications
  const allModifications = safeModifications
    .concat(confiscateSAFECollateralAndDebts)
    .concat(transferSAFECollateralAndDebtsProcessed);

  const events: LPRewardEvent[] = [];
  for (let u of allModifications) {
    if (!ownerMapping.has(u.safeHandler)) {
      console.log(`Safe handler ${u.safeHandler} has no owner`);
      continue;
    }

    events.push({
      type: RewardEventType.DELTA_DEBT,
      value: Number(u.deltaDebt),
      address: ownerMapping.get(u.safeHandler),
      logIndex: getLogIndexFromId(u.id),
      timestamp: Number(u.createdAt),
      cType: u.collateralType?.id,
    });
  }

  console.log(
    `  Fetched ${events.length} safe modifications events including ${safeModifications.length} standard safe modification, ${confiscateSAFECollateralAndDebts.length} safe confiscations, ${transferSAFECollateralAndDebts.length} transfer safe debt`
  );
  return events;
};

export const getPoolPositionUpdate = async (
  start: number,
  end: number
): Promise<LPRewardEvent[]> => {
  const query = `{
      positionSnapshots(where: {blockNumber_gte: ${start}, blockNumber_lte: ${end}, pool : "${
    config().UNISWAP_POOL_ADDRESS
  }"}, first: 1000, skip: [[skip]]) {
        owner
        timestamp
        liquidity
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

  const snapshots: {
    owner: string;
    timestamp: string;
    liquidity: string;
    position: {
      id: string;
      tickLower: {
        tickIdx: string;
      };
      tickUpper: {
        tickIdx: string;
      };
    };
  }[] = await subgraphQueryPaginated(
    query,
    "positionSnapshots",
    config().UNISWAP_SUBGRAPH_URL
  );
  let events: LPRewardEvent[] = [];

  for (let position of snapshots) {
    events.push({
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
    });
  }

  console.log(`  Fetched ${events.length} position update events`);

  return events;
};

export const getPoolSwap = async (
  start: number,
  end: number
): Promise<LPRewardEvent[]> => {
  const [startTime, endTime] = await Promise.all([
    blockToTimestamp(start),
    blockToTimestamp(end),
  ]);

  const query = `{
      swaps(where: {pool:"${
        config().UNISWAP_POOL_ADDRESS
      }", timestamp_gte: ${startTime}, timestamp_lte: ${endTime}}, first: 1000, skip:[[skip]]){
        sqrtPriceX96
        timestamp
        logIndex
      }
    }`;

  const data: {
    sqrtPriceX96: string;
    timestamp: string;
    logIndex: string;
  }[] = await subgraphQueryPaginated(
    query,
    "swaps",
    config().UNISWAP_SUBGRAPH_URL
  );

  const events = data.map((x) => ({
    type: RewardEventType.POOL_SWAP,
    value: Number(x.sqrtPriceX96),
    logIndex: Number(x.logIndex),
    timestamp: Number(x.timestamp),
  }));
  console.log(`  Fetched ${events.length} Uniswap swap events`);
  return events;
};

export const getUpdateAccumulatedRateEvent = async (
  start: number,
  end: number
): Promise<LPRewardEvent[]> => {
  const query = `{
              updateAccumulatedRates(orderBy: accumulatedRate, orderDirection: desc where: {createdAtBlock_gte: ${start}, createdAtBlock_lte: ${end}}, first: 1000, skip: [[skip]]) {
                id
                rateMultiplier
                createdAt
                collateralType {
                  id
                }
              }
          }`;

  const data: {
    id: string;
    rateMultiplier: string;
    createdAt: string;
    collateralType: { id: string };
  }[] = await subgraphQueryPaginated(
    query,
    "updateAccumulatedRates",
    config().LP_GEB_SUBGRAPH_URL
  );

  const events = data.map((x) => ({
    type: RewardEventType.UPDATE_ACCUMULATED_RATE,
    cType: x.collateralType.id,
    value: Number(x.rateMultiplier),
    logIndex: getLogIndexFromId(x.id),
    timestamp: Number(x.createdAt),
  }));
  console.log(`  Fetched ${events.length} accumulated rate events`);
  return events;
};

export const getLogIndexFromId = (id: string) => {
  const matches = id.split("-");

  if (matches.length < 2 || isNaN(Number(matches[1]))) {
    throw Error("Invalid log index");
  }

  return Number(matches[1]);
};
