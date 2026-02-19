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
  const query = buildHaiaeroCollateralQuery();
  const rawCollateralData = await fetchHaiaeroCollateral(query);
  return rawCollateralData as HaiveloCollateralEvent[];
};
