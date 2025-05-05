import { VeloDepositsResponse, VeloDepositEvent } from "./types";
import { config } from "../../config";
import { subgraphQuery, subgraphQueryPaginated } from "../../services/subgraph/utils";


/**
 * Fetches wrapped token deposit events from HAI Velo subgraph
 * @returns {Promise<VeloDepositEvent[]>} Array of deposit events
 */
export async function fetchVeloDepositEvents(): Promise<VeloDepositEvent[]> {
    const query = `
      {
        wrappedTokenDeposits(
          first: 1000
          orderBy: createdAt
          orderDirection: asc
        ) {
          id
          user {
            id
            address
          }
          amount
          createdAt
          createdAtBlock
          createdAtTransaction
        }
      }
    `;
  
    try {
      const data = await subgraphQuery(query, config().HAI_VELO_SUBGRAPH_URL);
      
      if (!data || !data.wrappedTokenDeposits) {
        console.error("No deposit data returned from HAI Velo subgraph");
        return [];
      }
  
      return data.wrappedTokenDeposits;
    } catch (error) {
      console.error("Error fetching HAI Velo deposit events:", error);
      throw error;
    }
  }

/**
 * Fetches wrapped token deposit events within a specific block range
 * @param startBlock The lower bound block number (inclusive)
 * @param endBlock The upper bound block number (inclusive)
 * @returns {Promise<VeloDepositEvent[]>} Array of deposit events within the block range
 */
export async function fetchVeloDepositEventsByBlockRange(
  startBlock: number,
  endBlock: number
): Promise<VeloDepositEvent[]> {
  const query = `
    {
      wrappedTokenDeposits(
        first: 1000
        orderBy: createdAtBlock
        orderDirection: asc
        where: {
          createdAtBlock_gte: ${startBlock},
          createdAtBlock_lte: ${endBlock}
        }
      ) {
        id
        user {
          id
          address
        }
        amount
        createdAt
        createdAtBlock
        createdAtTransaction
      }
    }
  `;

  try {
    const data = await subgraphQuery(query, config().HAI_VELO_SUBGRAPH_URL);
    
    if (!data || !data.wrappedTokenDeposits) {
      console.error(`No deposit data returned for block range ${startBlock}-${endBlock}`);
      return [];
    }

    return data.wrappedTokenDeposits;
  } catch (error) {
    console.error(`Error fetching HAI Velo deposit events for block range ${startBlock}-${endBlock}:`, error);
    throw error;
  }
}