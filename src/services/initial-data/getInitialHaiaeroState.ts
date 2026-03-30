import { UserList } from "../../types";
import { subgraphQueryPaginated } from "../subgraph/utils";
import { config } from "../../config";

// Reuse the same event type - the subgraph schema is identical for all collateral types
import { HaiveloCollateralEvent } from "./getInitialHaiveloState";

/**
 * Builds the GraphQL query to fetch HAIAERO collateral data from the subgraph.
 */
export const buildHaiaeroCollateralQuery = (): string => {
  const ids = config().HAIAERO_COLLATERAL_TYPE_IDS;
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
 * Fetches HAIAERO collateral data from the subgraph.
 */
export const fetchHaiaeroCollateral = async (query: string): Promise<any[]> => {
  return await subgraphQueryPaginated(
    query,
    "modifySAFECollateralizations",
    config().HAIAERO_SUBGRAPH_URL
  );
};

/**
 * Processes raw HAIAERO collateral data into a structured format grouped by user.
 */
export const processHaiaeroCollateral = (
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
 * Fetches and returns raw HAIAERO collateral data from the subgraph.
 */
export const getRawHaiaeroCollateralData = async (): Promise<
  HaiveloCollateralEvent[]
> => {
  const ids = config().HAIAERO_COLLATERAL_TYPE_IDS;
  const idsList = ids.map((id: string) => `"${id}"`).join(", ");
  const subgraphUrl = config().HAIAERO_SUBGRAPH_URL;

  // 1. Regular modification events
  const query = buildHaiaeroCollateralQuery();
  const rawCollateralData = await fetchHaiaeroCollateral(query);
  const modifications = rawCollateralData as HaiveloCollateralEvent[];

  // Build safeHandler → owner mapping
  const handlerToOwner = new Map<string, { id: string; address: string }>();
  for (const m of modifications) {
    const handler = m.safe.id.split("-")[0];
    handlerToOwner.set(handler, m.safe.owner);
  }

  // 2. Confiscation events (liquidations)
  const confiscationQuery = `{
    confiscateSAFECollateralAndDebts(
      where: { collateralType_: { id_in: [${idsList}] } },
      orderBy: createdAt, first: 1000, skip: [[skip]]
    ) {
      id
      deltaCollateral
      deltaDebt
      safeHandler
      createdAt
      createdAtBlock
      collateralType { id }
    }
  }`;
  const confiscations: any[] = await subgraphQueryPaginated(
    confiscationQuery, "confiscateSAFECollateralAndDebts", subgraphUrl
  );

  // 3. Transfer events
  const transferQuery = `{
    transferSAFECollateralAndDebts(
      where: { collateralType_: { id_in: [${idsList}] }, deltaCollateral_not: "0" },
      orderBy: createdAt, first: 1000, skip: [[skip]]
    ) {
      id
      deltaCollateral
      deltaDebt
      srcHandler
      dstHandler
      createdAt
      createdAtBlock
      collateralType { id }
    }
  }`;
  const transfers: any[] = await subgraphQueryPaginated(
    transferQuery, "transferSAFECollateralAndDebts", subgraphUrl
  );

  // Resolve unknown handlers
  const unknownHandlers = new Set<string>();
  for (const c of confiscations) {
    if (!handlerToOwner.has(c.safeHandler)) unknownHandlers.add(c.safeHandler);
  }
  for (const t of transfers) {
    if (!handlerToOwner.has(t.srcHandler)) unknownHandlers.add(t.srcHandler);
    if (!handlerToOwner.has(t.dstHandler)) unknownHandlers.add(t.dstHandler);
  }
  if (unknownHandlers.size > 0) {
    for (const handler of unknownHandlers) {
      for (const cTypeId of ids) {
        const safeId = `${handler}-${cTypeId}`;
        try {
          const safeQuery = `{ safe(id: "${safeId}") { owner { id address } } }`;
          const result: any = await subgraphQueryPaginated(safeQuery, "safe", subgraphUrl);
          if (result?.owner) handlerToOwner.set(handler, result.owner);
        } catch { /* ignore */ }
      }
    }
  }

  // Convert confiscation events
  for (const c of confiscations) {
    const owner = handlerToOwner.get(c.safeHandler);
    if (!owner || Number(c.deltaCollateral) === 0) continue;
    modifications.push({
      id: c.id,
      createdAt: c.createdAt,
      deltaCollateral: c.deltaCollateral,
      deltaDebt: c.deltaDebt || "0",
      safe: { id: `${c.safeHandler}-${c.collateralType.id}`, owner },
      collateralType: c.collateralType,
      createdAtTransaction: c.id.split("-")[0],
      createdAtBlock: c.createdAtBlock,
    });
  }

  // Convert transfer events
  for (const t of transfers) {
    const srcOwner = handlerToOwner.get(t.srcHandler);
    const dstOwner = handlerToOwner.get(t.dstHandler);
    const delta = Number(t.deltaCollateral);
    if (delta === 0) continue;
    if (dstOwner) {
      modifications.push({
        id: t.id + "-dst", createdAt: t.createdAt,
        deltaCollateral: t.deltaCollateral, deltaDebt: "0",
        safe: { id: `${t.dstHandler}-${t.collateralType.id}`, owner: dstOwner },
        collateralType: t.collateralType, createdAtTransaction: t.id.split("-")[0],
        createdAtBlock: t.createdAtBlock,
      });
    }
    if (srcOwner) {
      modifications.push({
        id: t.id + "-src", createdAt: t.createdAt,
        deltaCollateral: (-delta).toString(), deltaDebt: "0",
        safe: { id: `${t.srcHandler}-${t.collateralType.id}`, owner: srcOwner },
        collateralType: t.collateralType, createdAtTransaction: t.id.split("-")[0],
        createdAtBlock: t.createdAtBlock,
      });
    }
  }

  modifications.sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
  console.log(`[haiAERO] Fetched ${rawCollateralData.length} modifications, ${confiscations.length} confiscations, ${transfers.length} transfers`);

  return modifications;
};
