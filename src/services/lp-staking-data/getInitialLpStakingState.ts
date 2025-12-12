import { UserList } from "../../types";
import { LpStakingType } from "../../config/types";
import { getLpStakingPositions, LpStakingPositionEvent } from "./index";

/**
 * Process LP staking position events and convert to UserList format
 * This aggregates all events to calculate the current state for each user
 */
export const processLpStakingPositions = (
  positions: LpStakingPositionEvent[]
): UserList => {
  // Sort positions by timestamp
  const sortedPositions = [...positions].sort(
    (a, b) => parseInt(a.timestamp) - parseInt(b.timestamp)
  );

  return sortedPositions.reduce((acc, position) => {
    const userAddress = position.user.id.toLowerCase();
    const amount = Number(position.amount) / 1e18; // Convert from wei to token units

    if (acc[userAddress]) {
      // Update existing user
      if (position.type === 'STAKE') {
        acc[userAddress].collateral += amount;
      } else if (position.type === 'WITHDRAW') {
        acc[userAddress].collateral -= amount;
      }
      // Note: INITIATE_WITHDRAWAL and CANCEL_WITHDRAWAL don't change balance

      // Handle dusty balances
      if (acc[userAddress].collateral < 0 && acc[userAddress].collateral > -0.0001) {
        acc[userAddress].collateral = 0;
      }

      acc[userAddress].stakingWeight = acc[userAddress].collateral;
    } else {
      // Create new user entry
      const initialAmount = position.type === 'STAKE' ? amount : 0;

      acc[userAddress] = {
        address: userAddress,
        collateral: initialAmount,
        debt: 0,
        lpPositions: [],
        stakingWeight: initialAmount,
        rewardPerWeightStored: 0,
        earned: 0,
        totalBridgedTokens: 0,
        usedBridgedTokens: 0,
      };
    }

    return acc;
  }, {} as UserList);
};

/**
 * Get initial LP staking state at a specific block/timestamp
 * 
 * @param stakingType - The LP staking type (HAI_BOLD_CURVE or HAI_VELO_VELO)
 * @param beforeTimestamp - Only include events before this timestamp
 * @returns UserList with initial balances for all stakers
 */
export const getInitialLpStakingState = async (
  stakingType: LpStakingType,
  beforeTimestamp?: number
): Promise<UserList> => {
  // Fetch all staking positions
  const positions = await getLpStakingPositions(stakingType);

  // Filter positions before the specified timestamp if provided
  const filteredPositions = beforeTimestamp
    ? positions.filter((p) => parseInt(p.timestamp) < beforeTimestamp)
    : positions;

  // Filter only STAKE and WITHDRAW events (balance-changing events)
  const relevantPositions = filteredPositions.filter(
    (p) => p.type === 'STAKE' || p.type === 'WITHDRAW'
  );

  // Process and return the user list
  return processLpStakingPositions(relevantPositions);
};

/**
 * Get LP staking events within a block range (by timestamp)
 * Returns events that occur between startTimestamp and endTimestamp
 */
export const getLpStakingEventsInRange = async (
  stakingType: LpStakingType,
  startTimestamp: number,
  endTimestamp: number
): Promise<LpStakingPositionEvent[]> => {
  // Fetch all staking positions
  const positions = await getLpStakingPositions(stakingType);

  // Filter positions within the timestamp range
  return positions
    .filter((p) => {
      const timestamp = parseInt(p.timestamp);
      return timestamp >= startTimestamp && timestamp <= endTimestamp;
    })
    .filter((p) => p.type === 'STAKE' || p.type === 'WITHDRAW')
    .sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));
};

// For testing purposes
if (require.main === module) {
  (async () => {
    try {
      console.log('Getting initial LP staking state for HAI_BOLD_CURVE...');
      const haiBoldState = await getInitialLpStakingState('HAI_BOLD_CURVE');
      console.log(`Found ${Object.keys(haiBoldState).length} HAI_BOLD_CURVE stakers`);

      // Show top stakers
      const sortedStakers = Object.entries(haiBoldState)
        .sort(([, a], [, b]) => b.collateral - a.collateral)
        .slice(0, 5);

      console.log('\nTop 5 HAI_BOLD_CURVE stakers:');
      sortedStakers.forEach(([address, user], index) => {
        console.log(`${index + 1}. ${address}: ${user.collateral.toFixed(4)} tokens`);
      });

      console.log('\n---\n');

      console.log('Getting initial LP staking state for HAI_VELO_VELO...');
      const haiVeloState = await getInitialLpStakingState('HAI_VELO_VELO');
      console.log(`Found ${Object.keys(haiVeloState).length} HAI_VELO_VELO stakers`);

      // Show top stakers
      const sortedVeloStakers = Object.entries(haiVeloState)
        .sort(([, a], [, b]) => b.collateral - a.collateral)
        .slice(0, 5);

      console.log('\nTop 5 HAI_VELO_VELO stakers:');
      sortedVeloStakers.forEach(([address, user], index) => {
        console.log(`${index + 1}. ${address}: ${user.collateral.toFixed(4)} tokens`);
      });
    } catch (error) {
      console.error('Error:', error);
    }
  })();
}

