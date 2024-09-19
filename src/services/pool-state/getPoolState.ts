// getPoolState.ts

import { subgraphQuery } from "../subgraph/utils";

/**
 * Interface representing the pool state fetched from the subgraph.
 */
interface PoolState {
  sqrtPrice: string; // sqrtPrice is returned as a string from the subgraph
}

/**
 * Builds the GraphQL query to fetch the pool state at a specific block.
 *
 * @param {number} block - The block number at which to fetch the pool state.
 * @param {string} poolId - The ID of the Uniswap pool.
 * @returns {string} The GraphQL query string.
 */
export const buildPoolStateQuery = (block: number, poolId: string): string => {
  return `
    {
      pool(
        id: "${poolId}"
      ) {
        sqrtPrice
      }
    }
  `;
};

/**
 * Fetches the pool state from the subgraph using the provided query.
 *
 * @param {string} query - The GraphQL query string.
 * @param {string} subgraphUrl - The URL of the Uniswap subgraph API.
 * @returns {Promise<PoolState>} A promise that resolves to the pool state.
 */
export const fetchPoolState = async (
  query: string,
  subgraphUrl: string
): Promise<PoolState> => {
  const response = await subgraphQuery(query, subgraphUrl);
  return response.pool;
};

/**
 * Retrieves the pool state (sqrtPrice) at a specific block.
 *
 * @param {number} block - The block number at which to fetch the pool state.
 * @param {string} poolId - The ID of the Uniswap pool.
 * @param {string} subgraphUrl - The URL of the Uniswap subgraph API.
 * @returns {Promise<PoolState>} A promise that resolves to the pool state.
 */
export const getPoolState = async (
  block: number,
  poolId: string,
  subgraphUrl: string
): Promise<PoolState> => {
  // Build the query
  const query = buildPoolStateQuery(block, poolId);

  // Fetch the pool state
  const poolState = await fetchPoolState(query, subgraphUrl);

  return poolState;
};
