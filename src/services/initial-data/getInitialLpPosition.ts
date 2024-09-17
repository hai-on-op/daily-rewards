import { UserPositions, RawPosition, ProcessedPosition } from "../../types";
import { subgraphQueryPaginated } from "../subgraph/utils";

/**
 * Builds the GraphQL query to fetch LP positions from the subgraph.
 *
 * @param {number} startBlock - The block number at which to fetch positions.
 * @param {string} poolAddress - The address of the Uniswap pool.
 * @returns {string} The GraphQL query string.
 */
export const buildLpPositionsQuery = (
  startBlock: number,
  poolAddress: string
): string => {
  return `
    {
      positions(
        block: { number: ${startBlock} },
        where: { pool: "${poolAddress}" },
        first: 1000,
        skip: [[skip]]
      ) {
        id
        owner
        liquidity
        tickLower { tickIdx }
        tickUpper { tickIdx }
      }
    }
  `;
};

/**
 * Fetches LP positions from the subgraph using the provided query.
 *
 * @param {string} query - The GraphQL query string.
 * @param {string} subgraphUrl - The URL of the subgraph API.
 * @returns {Promise<RawPosition[]>} A promise that resolves to an array of raw LP positions.
 */
export const fetchLpPositions = async (
  query: string,
  subgraphUrl: string
): Promise<RawPosition[]> => {
  return await subgraphQueryPaginated(query, "positions", subgraphUrl);
};

/**
 * Processes raw LP positions into a structured format grouped by user.
 *
 * @param {RawPosition[]} positions - An array of raw LP positions.
 * @returns {UserPositions} An object mapping user addresses to their processed positions.
 */
export const processLpPositions = (positions: RawPosition[]): UserPositions => {
  return positions.reduce((acc, p) => {
    const processedPosition: ProcessedPosition = {
      lowerTick: parseInt(p.tickLower.tickIdx, 10),
      upperTick: parseInt(p.tickUpper.tickIdx, 10),
      liquidity: parseInt(p.liquidity, 10),
      tokenId: parseInt(p.id, 10),
    };

    if (acc[p.owner]) {
      acc[p.owner].positions.push(processedPosition);
    } else {
      acc[p.owner] = { positions: [processedPosition] };
    }
    return acc;
  }, {} as UserPositions);
};

/**
 * Retrieves and processes initial LP positions from the subgraph.
 *
 * @param {number} startBlock - The block number at which to fetch positions.
 * @param {string} poolAddress - The address of the Uniswap pool.
 * @param {string} subgraphUrl - The URL of the subgraph API.
 * @returns {Promise<UserPositions>} A promise that resolves to user positions mapping.
 */
export const getInitialLpPosition = async (
  startBlock: number,
  poolAddress: string,
  subgraphUrl: string
): Promise<UserPositions> => {
  // Build the query
  const query = buildLpPositionsQuery(startBlock, poolAddress);

  // Fetch raw positions
  const rawPositions = await fetchLpPositions(query, subgraphUrl);

  // Process positions
  const userPositions = processLpPositions(rawPositions);

  return userPositions;
};
