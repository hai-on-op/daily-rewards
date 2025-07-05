/**
 * Repository interface for claimed amounts data access
 */

import { ClaimedAmountsQuery, ClaimedAmountsResult } from './types';

export interface ClaimedAmountsRepository {
  /**
   * Fetches claimed amounts for a specific token and list of users
   * @param query - The query containing token and user addresses
   * @returns Promise that resolves to an array of claimed amounts
   */
  getClaimedAmounts(query: ClaimedAmountsQuery): Promise<ClaimedAmountsResult[]>;
}