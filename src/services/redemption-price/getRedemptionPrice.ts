// getRedemptionPrice.ts

import { subgraphQuery } from "../subgraph/utils";

/**
 * Interface representing the redemption price data structure.
 */
interface RedemptionPriceResult {
  value: string;
}

/**
 * Builds the GraphQL query to fetch the redemption price at a specific block.
 *
 * @param {number} block - The block number at which to fetch the redemption price.
 * @returns {string} The GraphQL query string.
 */
export const buildRedemptionPriceFromBlockQuery = (block: number): string => {
  return `
    {
      systemState(
        id: "current",
        block: { number: ${block} }
      ) {
        currentRedemptionPrice {
          value
        }
      }
    }
  `;
};

/**
 * Builds the GraphQL query to fetch the redemption price at a specific timestamp.
 *
 * @param {number} timestamp - The timestamp at which to fetch the redemption price.
 * @returns {string} The GraphQL query string.
 */
export const buildRedemptionPriceFromTimestampQuery = (
  timestamp: number
): string => {
  return `
    {
      redemptionPrices(
        orderBy: timestamp,
        orderDirection: desc,
        first: 1,
        where: { timestamp_lte: ${timestamp} }
      ) {
        value
      }
    }
  `;
};

/**
 * Fetches the redemption price data from the subgraph.
 *
 * @param {string} query - The GraphQL query string.
 * @param {string} subgraphUrl - The URL of the GEB subgraph API.
 * @returns {Promise<RedemptionPriceResult>} A promise that resolves to the redemption price data.
 */
export const fetchRedemptionPrice = async (
  query: string,
  subgraphUrl: string
): Promise<RedemptionPriceResult> => {
  const response = await subgraphQuery(query, subgraphUrl);
  if (response.systemState && response.systemState.currentRedemptionPrice) {
    return response.systemState.currentRedemptionPrice;
  } else if (
    response.redemptionPrices &&
    response.redemptionPrices.length > 0
  ) {
    return response.redemptionPrices[0];
  } else {
    throw new Error("Redemption price data not found in the response.");
  }
};

/**
 * Processes the redemption price data to extract the value as a number.
 *
 * @param {RedemptionPriceResult} data - The redemption price data.
 * @returns {number} The redemption price as a number.
 */
export const processRedemptionPrice = (data: RedemptionPriceResult): number => {
  return Number(data.value);
};

/**
 * Retrieves the redemption price at a specific block number.
 *
 * @param {number} block - The block number at which to fetch the redemption price.
 * @param {string} subgraphUrl - The URL of the GEB subgraph API.
 * @returns {Promise<number>} A promise that resolves to the redemption price.
 */
export const getRedemptionPriceFromBlock = async (
  block: number,
  subgraphUrl: string
): Promise<number> => {
  // Build the query
  const query = buildRedemptionPriceFromBlockQuery(block);

  // Fetch the data
  const data = await fetchRedemptionPrice(query, subgraphUrl);

  // Process the data
  const redemptionPrice = processRedemptionPrice(data);

  return redemptionPrice;
};

/**
 * Retrieves the redemption price at a specific timestamp.
 *
 * @param {number} timestamp - The timestamp at which to fetch the redemption price.
 * @param {string} subgraphUrl - The URL of the GEB subgraph API.
 * @returns {Promise<number>} A promise that resolves to the redemption price.
 */
export const getRedemptionPriceFromTimestamp = async (
  timestamp: number,
  subgraphUrl: string
): Promise<number> => {
  // Build the query
  const query = buildRedemptionPriceFromTimestampQuery(timestamp);

  // Fetch the data
  const data = await fetchRedemptionPrice(query, subgraphUrl);

  // Process the data
  const redemptionPrice = processRedemptionPrice(data);

  return redemptionPrice;
};
