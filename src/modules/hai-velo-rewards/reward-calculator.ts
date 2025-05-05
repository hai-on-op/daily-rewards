import { config } from "../../config";
import { fetchVeloDepositEvents, fetchVeloDepositEventsByBlockRange } from "./fetchers";
import { VeloDepositEvent } from "./types";
import { processUserDeposits } from "./processors";
import { calculateAllHaiVeloBoosts } from "./hai-velo-boost";
import { fetchStakingUsers, calculateTotalStaked } from "../stakedData";
import { UserDepositsMap, UserDeposit } from "./types";

/**
 * Interface for reward distribution results
 */
export interface RewardDistribution {
  userRewards: Record<string, number>;
  totalRewardsDistributed: number;
}

/**
 * Calculates rewards for users based on their deposits and boosts
 */
export class HaiVeloRewardCalculator {
  private startBlock: number;
  private endBlock: number;
  private totalRewardAmount: number;

  /**
   * Creates a new reward calculator
   * @param startBlock Block where reward period starts (for reward rate calculation)
   * @param endBlock Block where reward period ends
   * @param totalRewardAmount Total amount of rewards to distribute
   */
  constructor(startBlock: number, endBlock: number, totalRewardAmount: number) {
    this.startBlock = startBlock;
    this.endBlock = endBlock;
    this.totalRewardAmount = totalRewardAmount;
  }

  /**
   * Fetches all relevant data and calculates rewards
   * @returns Promise with reward distribution
   */
  public async calculateRewards(): Promise<RewardDistribution> {
    // Get all deposits up to the end block (not just from start block)
    // We'll treat deposits before the start block as if they happened at the start block
    const depositEvents = await fetchVeloDepositEventsByBlockRange(
      0, // From genesis block
      this.endBlock
    );

    // Sort by block (ascending)
    depositEvents.sort((a, b) => {
      const blockA = parseInt(a.createdAtBlock || '0');
      const blockB = parseInt(b.createdAtBlock || '0');
      return blockA - blockB;
    });

    console.log(`Found ${depositEvents.length} deposits up to block ${this.endBlock}`);

    // Process deposits to get user mappings
    const userDeposits = processUserDeposits(depositEvents);
    
    // Get staking data for boost calculation
    const stakingUsers = await fetchStakingUsers();
    const totalStaked = calculateTotalStaked(stakingUsers);
    
    // Calculate total deposits
    let totalDeposited = "0";
    Object.values(userDeposits).forEach(user => {
      const amount = parseFloat(user.totalAmount);
      totalDeposited = (parseFloat(totalDeposited) + amount).toString();
    });
    
    // Calculate boosts
    const boosts = calculateAllHaiVeloBoosts(
      userDeposits,
      totalDeposited,
      stakingUsers,
      totalStaked
    );
    
    // Calculate rewards with the deposits and their entry blocks
    const result = this.processRewards(userDeposits, boosts, depositEvents);
    
    return result;
  }

  /**
   * Process rewards based on user deposits, boosts, and when they deposited
   * @param userDeposits Map of user deposits
   * @param boosts Map of user boosts
   * @param depositEvents Original deposit events with block information
   * @returns Reward distribution
   */
  private processRewards(
    userDeposits: UserDepositsMap,
    boosts: Record<string, number>,
    depositEvents: VeloDepositEvent[]
  ): RewardDistribution {
    // Initialize reward structure
    const userRewards: Record<string, number> = {};
    
    // Calculate reward rate per block
    const blockSpan = this.endBlock - this.startBlock;
    const rewardRate = this.totalRewardAmount / blockSpan;
    
    console.log(`Reward rate: ${rewardRate} per block for ${blockSpan} blocks`);
    
    // Initialize tracking for boosted weights
    let totalBoostedWeight = 0;
    const userBoostedWeights: Record<string, number> = {};
    
    // Create a map of deposit events by user
    const depositsByUser: Record<string, VeloDepositEvent[]> = {};
    depositEvents.forEach(event => {
      const userAddress = event.user.address.toLowerCase();
      if (!depositsByUser[userAddress]) {
        depositsByUser[userAddress] = [];
      }
      depositsByUser[userAddress].push(event);
    });
    
    // For each user, calculate their reward share based on deposits and when they happened
    Object.entries(userDeposits).forEach(([address, deposit]) => {
      const userEvents = depositsByUser[address.toLowerCase()] || [];
      const boost = boosts[address] || 1.0;
      let totalUserWeight = 0;
      
      // Handle each deposit event for this user
      userEvents.forEach(event => {
        const depositBlock = parseInt(event.createdAtBlock || '0');
        const depositAmount = parseFloat(event.amount);
        
        // Calculate how many blocks this deposit is eligible for rewards
        let eligibleBlocks;
        if (depositBlock <= this.startBlock) {
          // Deposits before or at the start block get rewards for the full period
          eligibleBlocks = blockSpan;
        } else if (depositBlock > this.endBlock) {
          // Deposits after the end block get no rewards
          eligibleBlocks = 0;
        } else {
          // Deposits during the period get rewards proportional to their time
          eligibleBlocks = this.endBlock - depositBlock;
        }
        
        // Calculate weight for this deposit: amount * boost * eligible blocks
        const depositWeight = depositAmount * boost * eligibleBlocks;
        totalUserWeight += depositWeight;
      });
      
      userBoostedWeights[address] = totalUserWeight;
      totalBoostedWeight += totalUserWeight;
    });
    
    // Calculate final rewards based on proportion of boosted weights
    let totalRewardsDistributed = 0;
    
    if (totalBoostedWeight > 0) {
      Object.keys(userBoostedWeights).forEach(address => {
        const boostedWeight = userBoostedWeights[address];
        const rewardShare = boostedWeight / totalBoostedWeight;
        const reward = this.totalRewardAmount * rewardShare;
        
        userRewards[address] = reward;
        totalRewardsDistributed += reward;
      });
    }
    
    return {
      userRewards,
      totalRewardsDistributed
    };
  }
}

// Example usage
async function main() {
  try {
    // Get block range from config
    const startBlock = config().START_BLOCK;
    const endBlock = config().END_BLOCK;
    const rewardAmount = config().REWARD_AMOUNT;
    
    console.log(`Calculating rewards for blocks ${startBlock} to ${endBlock}`);
    console.log(`Total reward amount: ${rewardAmount}`);
    
    // Create calculator
    const calculator = new HaiVeloRewardCalculator(startBlock, endBlock, rewardAmount);
    
    // Calculate rewards
    const distribution = await calculator.calculateRewards();
    
    console.log(`\nReward distribution complete:`);
    console.log(`Total rewards distributed: ${distribution.totalRewardsDistributed}`);
    console.log(`Number of reward recipients: ${Object.keys(distribution.userRewards).length}`);
    
    // Display top recipients
    const topRecipients = Object.entries(distribution.userRewards)
      .sort(([, amountA], [, amountB]) => amountB - amountA)
    
    console.log("\nTop reward recipients:");
    topRecipients.forEach(([address, amount], index) => {
      console.log(`${index + 1}. ${address}: ${amount.toFixed(6)} tokens`);
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

export default HaiVeloRewardCalculator;
