/**
 * Subgraph repository implementation for claimed amounts
 */

import { ClaimedAmountsRepository, ClaimedAmountsQuery, ClaimedAmountsResult, TokenClaim } from '../../domain/claimed-amounts/index';
import { subgraphQuery } from './utils';
import { config } from '../../config';

export class SubgraphClaimedAmountsRepository implements ClaimedAmountsRepository {
  private readonly subgraphUrl: string;

  constructor() {
    this.subgraphUrl = config().DISTRIBUTOR_SUBGRAPH_URL;
  }

  async getClaimedAmounts(query: ClaimedAmountsQuery): Promise<ClaimedAmountsResult[]> {
    const { token, users } = query;

    // Normalize addresses to lowercase
    const normalizedUsers = users.map((user: string) => user?.toLowerCase()).filter(Boolean);

    if (normalizedUsers.length === 0) {
      return [];
    }

    const graphqlQuery = `
      {
        tokenClaims(where: {
          token: "${token.toLowerCase()}"
          user_in: ${JSON.stringify(normalizedUsers)}
        }) {
          user {
            id
          }
          totalAmount
        }
      }
    `;

    try {
      const response = await subgraphQuery(graphqlQuery, this.subgraphUrl);

      if (!response.tokenClaims) {
        console.warn(`No tokenClaims found in response for token ${token}`);
        return [];
      }

      return response.tokenClaims.map((claim: TokenClaim) => ({
        userAddress: claim.user.id.toLowerCase(),
        claimedAmount: claim.totalAmount
      }));
    } catch (error) {
      console.error(`Error fetching claimed amounts for token ${token}:`, error);
      return [];
    }
  }
}