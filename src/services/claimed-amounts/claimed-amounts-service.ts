/**
 * Service layer for claimed amounts business logic
 */

import { ClaimedAmountsRepository, ClaimedAmountsQuery, ClaimedAmountsMap } from '../../domain/claimed-amounts';

export class ClaimedAmountsService {
  constructor(private readonly repository: ClaimedAmountsRepository) {}

  /**
   * Gets claimed amounts for a token and list of users, returning a map for easy lookup
   * @param token - The token address
   * @param users - Array of user addresses
   * @returns Promise that resolves to a map of user address to claimed amount
   */
  async getClaimedAmountsMap(token: string, users: string[]): Promise<ClaimedAmountsMap> {
    if (!token || users.length === 0) {
      return {};
    }

    try {
      const query: ClaimedAmountsQuery = { token, users };
      const claimedAmounts = await this.repository.getClaimedAmounts(query);

      // Convert array to map for efficient lookup
      const claimedAmountsMap: ClaimedAmountsMap = {};
      claimedAmounts.forEach(({ userAddress, claimedAmount }) => {
        claimedAmountsMap[userAddress] = claimedAmount;
      });

      return claimedAmountsMap;
    } catch (error) {
      console.error('Error getting claimed amounts map:', error);
      return {};
    }
  }

  /**
   * Gets claimed amount for a specific user and token
   * @param token - The token address
   * @param userAddress - The user address
   * @returns Promise that resolves to the claimed amount as a string
   */
  async getClaimedAmountForUser(token: string, userAddress: string): Promise<string> {
    const claimedAmountsMap = await this.getClaimedAmountsMap(token, [userAddress]);
    return claimedAmountsMap[userAddress.toLowerCase()] || '0';
  }
} 