import { UserList } from "../../types";
import { subgraphQueryPaginated } from "../subgraph/utils";
import { config } from "../../config";

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
 * Builds the GraphQL query to fetch HAIVELO collateral data from the subgraph.
 *
 * @returns {string} The GraphQL query string.
 */
export const buildHaiveloCollateralQuery = (collateralId: string): string => {
  return `
    {
      modifySAFECollateralizations(
        where: {
          collateralType_: { id: "${collateralId}" },
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
export const fetchHaiveloCollateral = async (
  query: string,
  subgraphUrl?: string
): Promise<any[]> => {
  return await subgraphQueryPaginated(
    query,
    "modifySAFECollateralizations",
    subgraphUrl || config().HAIVELO_SUBGRAPH_URL
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
export const getRawHaiveloCollateralDataV1 = async (): Promise<HaiveloCollateralEvent[]> => {
  const cfg = config();
  const query = buildHaiveloCollateralQuery(cfg.HAIVELO_V1_COLLATERAL_ID);
  const raw = await fetchHaiveloCollateral(query, cfg.HAIVELO_V1_SUBGRAPH_URL);
  return raw as HaiveloCollateralEvent[];
};

export const getRawHaiveloCollateralDataV2 = async (): Promise<HaiveloCollateralEvent[]> => {
  const cfg = config();
  const query = buildHaiveloCollateralQuery(cfg.HAIVELO_V2_COLLATERAL_ID);
  const raw = await fetchHaiveloCollateral(query, cfg.HAIVELO_V2_SUBGRAPH_URL);
  return raw as HaiveloCollateralEvent[];
};

export type VersionedHaiveloEvent = HaiveloCollateralEvent & { __version: 'v1' | 'v2' };

export const getRawHaiveloCollateralDataUnified = async (): Promise<VersionedHaiveloEvent[]> => {
  const [v1, v2] = await Promise.all([
    getRawHaiveloCollateralDataV1().catch(() => []),
    getRawHaiveloCollateralDataV2().catch(() => []),
  ]);

  const taggedV1: VersionedHaiveloEvent[] = (v1 || []).map(e => ({ ...e, __version: 'v1' }));
  const taggedV2: VersionedHaiveloEvent[] = (v2 || []).map(e => ({ ...e, __version: 'v2' }));

  // Merge unsorted; callers can sort/filter by block or createdAt
  return [...taggedV1, ...taggedV2];
};

/**
 * Retrieves and processes initial HAIVELO collateral data from the subgraph.
 *
 * @returns {Promise<UserList>} A promise that resolves to mapping of users to their HAIVELO collateral.
 */
export const getInitialHaiveloState = async (): Promise<UserList> => {
  const cfg = config();
  const queryV1 = buildHaiveloCollateralQuery(cfg.HAIVELO_V1_COLLATERAL_ID);
  const queryV2 = buildHaiveloCollateralQuery(cfg.HAIVELO_V2_COLLATERAL_ID);
  const [rawV1, rawV2] = await Promise.all([
    fetchHaiveloCollateral(queryV1, cfg.HAIVELO_V1_SUBGRAPH_URL).catch(() => []),
    fetchHaiveloCollateral(queryV2, cfg.HAIVELO_V2_SUBGRAPH_URL).catch(() => []),
  ]);

  const userCollateralV1 = processHaiveloCollateral(rawV1 as HaiveloCollateralEvent[]);
  const userCollateralV2 = processHaiveloCollateral(rawV2 as HaiveloCollateralEvent[]);

  // Combine user maps by summing collateral and stakingWeight
  const combined: UserList = { ...userCollateralV1 };
  Object.entries(userCollateralV2).forEach(([address, user]) => {
    if (combined[address]) {
      combined[address].collateral += user.collateral;
      combined[address].stakingWeight = combined[address].collateral;
    } else {
      combined[address] = user;
    }
  });

  return combined;
};
