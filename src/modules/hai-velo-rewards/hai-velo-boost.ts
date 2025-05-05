import { UserDeposit } from "./types";
import { StakingUser } from "../stakedData";

/**
 * Calculate HAI Velo boost for a user based on their staking and deposit ratios
 * Formula: (user staked / total staked) / (user deposited / total deposited) + 1
 * 
 * @param userAddress The user's address
 * @param userDeposits Map of all users' deposits
 * @param totalDeposited Total amount deposited across all users
 * @param stakingUsers Array of all staking users
 * @param totalStaked Total amount staked across all users
 * @returns The calculated HAI Velo boost value or 1.0 if the user has no stake or deposit
 */
export function calculateHaiVeloBoost(
  userAddress: string,
  userDeposits: Record<string, UserDeposit>,
  totalDeposited: string,
  stakingUsers: StakingUser[],
  totalStaked: string
): number {
  // Normalize address for comparison
  const normalizedAddress = userAddress.toLowerCase();
  
  // Get user's deposit amount
  const userDeposit = userDeposits[normalizedAddress];
  const userDepositAmount = userDeposit ? parseFloat(userDeposit.totalAmount) : 0;
  
  // Get user's staked amount
  const userStaking = stakingUsers.find(user => 
    user.id.toLowerCase() === normalizedAddress
  );
  const userStakedAmount = userStaking ? parseFloat(userStaking.stakedBalance) : 0;
  
  // Convert total amounts to numbers
  const totalDepositedNum = parseFloat(totalDeposited);
  const totalStakedNum = parseFloat(totalStaked);
  
  // Handle edge cases
  if (userDepositAmount === 0 || totalDepositedNum === 0) {
    return 1.0; // Default boost if user has no deposits
  }
  
  if (userStakedAmount === 0 || totalStakedNum === 0) {
    return 1.0; // Default boost if user has no stake or there's no total stake
  }
  
  // Calculate the ratios
  const stakingRatio = userStakedAmount / totalStakedNum;
  const depositRatio = userDepositAmount / totalDepositedNum;
  
  // Calculate boost using the formula
  // (user staked / total staked) / (user deposited / total deposited) + 1
  const boost = (stakingRatio / depositRatio) + 1;
  
  return boost;
}

/**
 * Calculate HAI Velo boost for all users
 * 
 * @param userDeposits Map of all users' deposits
 * @param totalDeposited Total amount deposited across all users
 * @param stakingUsers Array of all staking users
 * @param totalStaked Total amount staked across all users
 * @returns A map of user addresses to their HAI Velo boost values
 */
export function calculateAllHaiVeloBoosts(
  userDeposits: Record<string, UserDeposit>,
  totalDeposited: string,
  stakingUsers: StakingUser[],
  totalStaked: string
): Record<string, number> {
  const boosts: Record<string, number> = {};
  
  // Calculate boost for each user with deposits
  Object.keys(userDeposits).forEach(userAddress => {
    boosts[userAddress] = calculateHaiVeloBoost(
      userAddress,
      userDeposits,
      totalDeposited,
      stakingUsers,
      totalStaked
    );
  });
  
  return boosts;
}

/**
 * Format boost for display
 * 
 * @param boost The boost value
 * @returns Formatted boost string
 */
export function formatBoost(boost: number): string {
  return boost.toFixed(2) + "x";
}

export default {
  calculateHaiVeloBoost,
  calculateAllHaiVeloBoosts,
  formatBoost
};
