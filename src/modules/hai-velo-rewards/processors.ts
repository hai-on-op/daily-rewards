import { VeloDepositEvent, UserDeposit, UserDepositsMap } from "./types";

/**
 * Processes deposit events and returns deposits aggregated by user address
 * @param events Array of deposit events
 * @returns Map of user addresses to their deposit information
 */
export function processUserDeposits(events: VeloDepositEvent[]): UserDepositsMap {
  const userDeposits: UserDepositsMap = {};

  for (const event of events) {
    const userAddress = event.user.address.toLowerCase();
    
    if (!userDeposits[userAddress]) {
      userDeposits[userAddress] = {
        address: userAddress,
        totalAmount: "0",
        deposits: []
      };
    }
    
    // Add deposit to user's deposits list
    userDeposits[userAddress].deposits.push(event);
    
    // Handle the amount as a decimal string
    try {
      // Parse amount as a number first
      const amount = parseFloat(event.amount);
      // Add to current total
      const currentTotal = parseFloat(userDeposits[userAddress].totalAmount);
      // Store the sum as string
      userDeposits[userAddress].totalAmount = (currentTotal + amount).toString();
    } catch (error) {
      console.error(`Error processing amount for user ${userAddress}:`, error);
      console.error(`Amount value: "${event.amount}"`);
    }
  }

  return userDeposits;
}

/**
 * Get total deposits for all users, sorted by deposit amount (descending)
 * @param userDeposits Map of user deposits
 * @returns Array of user deposits sorted by amount
 */
export function getSortedUserDeposits(userDeposits: UserDepositsMap): UserDeposit[] {
  return Object.values(userDeposits)
    .sort((a, b) => {
      const amountA = parseFloat(a.totalAmount);
      const amountB = parseFloat(b.totalAmount);
      return amountB - amountA;
    });
}

/**
 * Calculate the total deposit amount across all users
 * @param userDeposits Map of user deposits
 * @returns Total deposit amount as string
 */
export function calculateTotalDeposits(userDeposits: UserDepositsMap): string {
  let total = 0;
  
  Object.values(userDeposits).forEach(user => {
    total += parseFloat(user.totalAmount);
  });
  
  return total.toString();
} 