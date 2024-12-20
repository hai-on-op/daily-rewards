// getInitialSafesDebt.ts

import { subgraphQueryPaginated } from "../subgraph/utils";
import { getAccumulatedRate } from "./getAccumulatedRate";

/**
 * Interface representing the structure of a safe's debt data.
 */
export interface SafeDebt {
  debt: string;
  safeHandler: string;
  collateralType: {
    id: string;
  };
}

/**
 * Interface representing the processed debt information.
 */
export interface ProcessedDebt {
  address: string;
  debt: number;
}

/**
 * Builds the GraphQL query to fetch safes with debt, optionally filtering by collateral type.
 *
 * @param {number} startBlock - The block number at which to fetch safes.
 * @param {string | null} cType - The collateral type identifier. If null, no filter is applied.
 * @returns {string} The GraphQL query string.
 */
export const buildSafesDebtQuery = (
  startBlock: number,
  cType?: string
): string => {
  const collateralFilter = cType ? `, collateralType: "${cType}"` : "";
  return `
    {
      safes(
        where: { debt_gt: 0${collateralFilter} },
        first: 1000,
        skip: [[skip]],
        block: { number: ${startBlock} }
      ) {
        debt
        safeHandler
        collateralType { id }
      }
    }
  `;
};

/**
 * Fetches safes with debt from the subgraph using the provided query.
 *
 * @param {string} query - The GraphQL query string.
 * @param {string} subgraphUrl - The URL of the subgraph API.
 * @returns {Promise<SafeDebt[]>} A promise that resolves to an array of safes with debt.
 */
export const fetchSafesDebt = async (
  query: string,
  subgraphUrl: string
): Promise<SafeDebt[]> => {
  return await subgraphQueryPaginated(query, "safes", subgraphUrl);
};

/**
 * Processes the fetched safes to calculate adjusted debts using accumulated rates.
 *
 * @param {SafeDebt[]} debtsGraph - Array of safes with debt data.
 * @param {Map<string, string>} ownerMapping - Map of safe handlers to owner addresses.
 * @param {number} startBlock - The block number at which to fetch accumulated rates.
 * @param {string[]} collateralTypes - Array of collateral types to consider.
 * @param {string} subgraphUrl - The URL of the subgraph API.
 * @returns {Promise<ProcessedDebt[]>} A promise that resolves to an array of processed debts.
 */
export const processSafesDebt = async (
  debtsGraph: SafeDebt[],
  ownerMapping: Map<string, string>,
  startBlock: number,
  collateralTypes: string[],
  subgraphUrl: string
): Promise<ProcessedDebt[]> => {
  // Fetch accumulated rates for collateral types
  const rates: { [key: string]: number } = {};

  for (const cType of collateralTypes) {
    rates[cType] = await getAccumulatedRate(startBlock, cType, subgraphUrl);
  }

  const debts: ProcessedDebt[] = [];

  for (const u of debtsGraph) {
    const ownerAddress = ownerMapping.get(u.safeHandler);
    if (!ownerAddress) {
      console.log(`Safe handler ${u.safeHandler} has no owner`);
      continue;
    }

    const cTypeId = u.collateralType.id;
    const cRate = rates[cTypeId];

    debts.push({
      address: ownerAddress,
      debt: Number(u.debt) * cRate,
    });
  }

  return debts;
};

/**
 * Retrieves and processes initial safes' debts from the subgraph.
 *
 * @param {number} startBlock - The block number at which to fetch safes.
 * @param {Map<string, string>} ownerMapping - Map of safe handlers to owner addresses.
 * @param {string[]} collateralTypes - Array of collateral types to consider.
 * @param {string} subgraphUrl - The URL of the subgraph API.
 * @param {string} [cType] - Optional collateral type to filter safes.
 * @returns {Promise<ProcessedDebt[]>} A promise that resolves to an array of processed debts.
 */
export const getInitialSafesDebt = async (
  startBlock: number,
  ownerMapping: Map<string, string>,
  collateralTypes: string[],
  subgraphUrl: string,
  cType?: string
): Promise<ProcessedDebt[]> => {
  // Build the query
  const query = buildSafesDebtQuery(startBlock, cType);

  // Fetch safes with debt
  const debtsGraph = await fetchSafesDebt(query, subgraphUrl);

  console.log(`Fetched ${debtsGraph.length} debts`);

  // Process safes to get adjusted debts
  const debts = await processSafesDebt(
    debtsGraph,
    ownerMapping,
    startBlock,
    collateralTypes,
    subgraphUrl
  );

  return debts;
};
