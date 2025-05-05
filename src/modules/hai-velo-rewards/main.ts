import { fetchVeloDepositEvents } from "./fetchers";
import { processUserDeposits, getSortedUserDeposits, calculateTotalDeposits } from "./processors";
import { calculateHaiVeloBoost, calculateAllHaiVeloBoosts, formatBoost } from "./hai-velo-boost";
import { fetchStakingUsers, calculateTotalStaked } from "../stakedData";

// Example usage
async function main() {
  try {
    // Fetch deposit data
    console.log("Fetching HAI Velo deposit events...");
    const depositEvents = await fetchVeloDepositEvents();
    console.log(`Found ${depositEvents.length} deposit events`);

    // Process deposit events to get user deposits
    console.log("Processing user deposits...");
    const userDeposits = processUserDeposits(depositEvents);
    console.log(`Found ${Object.keys(userDeposits).length} unique users with deposits`);

    // Calculate total deposits
    const totalDeposited = calculateTotalDeposits(userDeposits);
    console.log(`Total deposit amount: ${parseFloat(totalDeposited).toFixed(6)} ETH`);

    // Fetch staking data
    console.log("Fetching staking data...");
    const stakingUsers = await fetchStakingUsers();
    console.log(`Found ${stakingUsers.length} staking users`);

    // Calculate total staked
    const totalStaked = calculateTotalStaked(stakingUsers);
    console.log(`Total staked amount: ${parseFloat(totalStaked).toFixed(6)} KITE`);

    // Calculate HAI Velo boosts for all users
    console.log("Calculating HAI Velo boosts...");
    const haiVeloBoosts = calculateAllHaiVeloBoosts(userDeposits, totalDeposited, stakingUsers, totalStaked);
    
    // Get sorted user deposits
    const sortedUserDeposits = getSortedUserDeposits(userDeposits);
    
    // Print top users by deposit amount with their HAI Velo boost
    console.log("\nTop users by deposit amount (with HAI Velo boost):");
    sortedUserDeposits.slice(0, 10).forEach((user, index) => {
      const haiVeloBoost = haiVeloBoosts[user.address] || 1.0;
      console.log(`${index + 1}. Address: ${user.address}`);
      console.log(`   Total Deposit: ${parseFloat(user.totalAmount).toFixed(6)} ETH`);
      console.log(`   Number of Deposits: ${user.deposits.length}`);
      
      // Get staking info if available
      const userStaking = stakingUsers.find(s => s.id.toLowerCase() === user.address.toLowerCase());
      const stakedAmount = userStaking ? parseFloat(userStaking.stakedBalance).toFixed(6) : "0";
      console.log(`   Staked Amount: ${stakedAmount} KITE`);
      
      // Show HAI Velo boost
      console.log(`   HAI Velo Boost: ${formatBoost(haiVeloBoost)}`);
      console.log("");
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

export { fetchVeloDepositEvents };
