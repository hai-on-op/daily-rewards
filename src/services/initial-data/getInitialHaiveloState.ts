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
export const buildHaiveloCollateralQuery = (): string => {
  return `
    {
      modifySAFECollateralizations(
        where: {
          collateralType_: { id: "HAIVELO" },
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
