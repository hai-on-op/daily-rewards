import { config } from "../../config";
import { subgraphQuery } from "../../services/subgraph/utils";

// Define types for staking data
export interface StakingUser {
  id: string;
  stakedBalance: string;
}

export interface StakingUsersResponse {
  stakingUsers: StakingUser[];
}

export interface UserStakingRatio {
  address: string;
  stakedBalance: string;
  ratio: number;
  formattedRatio: string;
}

/**
 * Fetches all staking users and their balances
 * @returns {Promise<StakingUser[]>} Array of staking users with their balances
 */
export async function fetchStakingUsers(): Promise<StakingUser[]> {
  const query = `
    {
      stakingUsers(first: 1000) {
        id
        stakedBalance
      }
    }
  `;

  try {
    const data = await subgraphQuery(query, config().STKITE_SUBGRAPH_URL);
    
    if (!data || !data.stakingUsers) {
      console.error("No staking data returned from subgraph");
      return [];
    }

    return data.stakingUsers;
  } catch (error) {
    console.error("Error fetching staking users:", error);
    throw error;
  }
}

/**
 * Calculate the total staked amount across all users
 * @param stakingUsers Array of staking users
 * @returns Total staked amount as string
 */
export function calculateTotalStaked(stakingUsers: StakingUser[]): string {
  let total = 0;
  
  stakingUsers.forEach(user => {
    total += parseFloat(user.stakedBalance);
  });
  
  return total.toString();
}

/**
 * Calculate the staking ratio for each user
 * @param stakingUsers Array of staking users
 * @returns Array of users with their staking ratios
 */
export function calculateStakingRatios(stakingUsers: StakingUser[]): UserStakingRatio[] {
  const totalStaked = parseFloat(calculateTotalStaked(stakingUsers));
  
  return stakingUsers.map(user => {
    const stakedBalance = parseFloat(user.stakedBalance);
    const ratio = totalStaked > 0 ? stakedBalance / totalStaked : 0;
    
    return {
      address: user.id,
      stakedBalance: user.stakedBalance,
      ratio: ratio,
      formattedRatio: `${(ratio * 100).toFixed(4)}%`
    };
  });
}

/**
 * Get staking users sorted by staked amount (descending)
 * @param stakingUsers Array of staking users
 * @returns Sorted array of staking users
 */
export function getSortedStakingUsers(stakingUsers: StakingUser[]): StakingUser[] {
  return [...stakingUsers].sort((a, b) => {
    const balanceA = parseFloat(a.stakedBalance);
    const balanceB = parseFloat(b.stakedBalance);
    return balanceB - balanceA;
  });
}

// Example usage
async function main() {
  try {
    console.log("Fetching staking users...");
    const stakingUsers = await fetchStakingUsers();
    console.log(`Found ${stakingUsers.length} staking users`);

    // Calculate total staked
    const totalStaked = calculateTotalStaked(stakingUsers);
    console.log(`Total staked amount: ${parseFloat(totalStaked).toFixed(6)} KITE`);

    // Calculate staking ratios
    const stakingRatios = calculateStakingRatios(stakingUsers);
    
    // Get sorted staking users
    const sortedUsers = getSortedStakingUsers(stakingUsers);
    
    // Print top stakers with their ratios
    console.log("\nTop stakers by amount:");
    sortedUsers.slice(0, 5).forEach((user, index) => {
      const userRatio = stakingRatios.find(r => r.address === user.id);
      console.log(`${index + 1}. Address: ${user.id}`);
      console.log(`   Staked Amount: ${parseFloat(user.stakedBalance).toFixed(6)} KITE`);
      console.log(`   Ratio of Total: ${userRatio?.formattedRatio}`);
    });
  } catch (error) {
    console.error("Error in main function:", error);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error in main:", error);
    process.exit(1);
  });
}
