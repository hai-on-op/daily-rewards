/**
 * Domain types for claimed amounts functionality
 */

export interface TokenClaim {
  user: {
    id: string;
  };
  totalAmount: string;
}

export interface ClaimedAmountsQuery {
  token: string;
  users: string[];
}

export interface ClaimedAmountsResult {
  userAddress: string;
  claimedAmount: string;
}

export interface ClaimedAmountsMap {
  [userAddress: string]: string;
} 