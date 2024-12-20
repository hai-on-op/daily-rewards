import { config } from "../../config";
import { subgraphQuery } from "../subgraph/utils";

/**
 * Interface representing the structure of the subgraph response for accumulated rate.
 */
interface CollateralTypeResult {
  collateralType: {
    accumulatedRate: string;
  };
}

/**
 * Builds the GraphQL query to fetch the accumulated rate for a collateral type at a specific block.
 *
 * @param {number} block - The block number at which to fetch the accumulated rate.
 * @param {string} cType - The collateral type identifier.
 * @returns {string} The GraphQL query string.
 */
export const buildAccumulatedRateQuery = (
  block: number,
  cType: string
): string => {
  return `
    {
      collateralType(id: "${cType}", block: { number: ${block} }) {
        accumulatedRate
      }
    }
  `;
};

/**
 * Fetches the accumulated rate data from the subgraph.
 *
 * @param {string} query - The GraphQL query string.
 * @param {string} subgraphUrl - The URL of the subgraph API.
 * @returns {Promise<CollateralTypeResult>} A promise that resolves to the accumulated rate data.
 */
export const fetchAccumulatedRate = async (
  query: string,
  subgraphUrl: string
): Promise<CollateralTypeResult> => {
  return await subgraphQuery(query, subgraphUrl);
};

/**
 * Processes the fetched data to extract the accumulated rate.
 *
 * @param {CollateralTypeResult} data - The data fetched from the subgraph.
 * @returns {number} The accumulated rate as a number.
 */
export const processAccumulatedRate = (data: CollateralTypeResult): number => {
  return Number(data.collateralType.accumulatedRate);
};

/**
 * Retrieves the accumulated rate for a specific collateral type at a given block number.
 *
 * @param {number} block - The block number at which to fetch the accumulated rate.
 * @param {string} cType - The collateral type identifier.
 * @param {string} subgraphUrl - The URL of the subgraph API.
 * @returns {Promise<number>} A promise that resolves to the accumulated rate.
 */
export const getAccumulatedRate = async (
  block: number,
  cType: string,
  subgraphUrl: string = config().GEB_SUBGRAPH_URL
): Promise<number> => {
  // Build the query

  const query = buildAccumulatedRateQuery(block, cType);

  // Fetch data
  const data = await fetchAccumulatedRate(query, subgraphUrl);

  // Process data
  const accumulatedRate = processAccumulatedRate(data);

  return accumulatedRate;
};
