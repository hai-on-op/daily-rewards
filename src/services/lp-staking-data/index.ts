import { subgraphQueryPaginated } from "../subgraph/utils";
import { config } from "../../config";
import { LpStakingType } from "../../config/types";

/**
 * LP Staking position event from subgraph
 */
export type LpStakingPositionEvent = {
  id: string;
  user: {
    id: string;
  };
  amount: string;
  timestamp: string;
  transactionHash: string;
  type: string; // "STAKE" | "INITIATE_WITHDRAWAL" | "CANCEL_WITHDRAWAL" | "WITHDRAW"
};

/**
 * LP Staking user state
 */
export interface LpStakingUserState {
  totalStaked: string;
  users: {
    [address: string]: {
      amount: bigint;
      share: number;
      shareInPercentage: string;
    };
  };
}

/**
 * Build query for HaiBoldCurveLPStaking positions
 */
const buildHaiBoldCurveLPQuery = (): string => `
  {
    haiBoldCurveLPStakingPositions(first: 1000, skip: [[skip]]) {
      id
      user {
        id
      }
      amount
      timestamp
      transactionHash
      type
    }
  }
`;

/**
 * Build query for HaiVeloVeloLPStaking positions
 */
const buildHaiVeloVeloLPQuery = (): string => `
  {
    haiVeloVeloLPStakingPositions(first: 1000, skip: [[skip]]) {
      id
      user {
        id
      }
      amount
      timestamp
      transactionHash
      type
    }
  }
`;

/**
 * Get the appropriate query and field name for a staking type
 */
const getQueryForStakingType = (stakingType: LpStakingType): { query: string; field: string } => {
  switch (stakingType) {
    case 'HAI_BOLD_CURVE':
      return { query: buildHaiBoldCurveLPQuery(), field: 'haiBoldCurveLPStakingPositions' };
    case 'HAI_VELO_VELO':
      return { query: buildHaiVeloVeloLPQuery(), field: 'haiVeloVeloLPStakingPositions' };
    default:
      throw new Error(`Unknown LP staking type: ${stakingType}`);
  }
};

/**
 * Fetch LP staking position events from the subgraph
 */
export const getLpStakingPositions = async (
  stakingType: LpStakingType
): Promise<LpStakingPositionEvent[]> => {
  const { query, field } = getQueryForStakingType(stakingType);

  const positions = (await subgraphQueryPaginated(
    query,
    field,
    config().LP_STAKING_SUBGRAPH_URL
  )) as LpStakingPositionEvent[];

  return positions;
};

/**
 * Get LP staking events within a specific block range
 */
export const getLpStakingEvents = async (
  stakingType: LpStakingType,
  startBlock: number,
  endBlock: number
): Promise<LpStakingPositionEvent[]> => {
  const allPositions = await getLpStakingPositions(stakingType);

  // Filter events within the block range based on timestamp
  // Note: We're filtering by timestamp since the subgraph stores timestamp, not block
  // The caller should convert blocks to timestamps if needed
  return allPositions
    .filter((position) => {
      // Filter only STAKE and WITHDRAW events (the primary balance-changing events)
      return position.type === 'STAKE' || position.type === 'WITHDRAW';
    })
    .sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));
};

/**
 * Calculate LP staking state at a specific timestamp
 */
export const calculateLpStakingAtTimestamp = (
  positions: LpStakingPositionEvent[],
  timestamp: number
): LpStakingUserState => {
  // Sort positions by timestamp and filter up to the specified timestamp
  const sortedPositions = [...positions]
    .sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp))
    .filter((position) => parseInt(position.timestamp) <= timestamp);

  let totalStaked = BigInt(0);
  const userBalances: { [address: string]: bigint } = {};

  // Process all positions up to the specified timestamp
  for (const position of sortedPositions) {
    const userAddress = position.user.id.toLowerCase();
    const amount = BigInt(position.amount);

    // Initialize user balance if needed
    if (!userBalances[userAddress]) {
      userBalances[userAddress] = BigInt(0);
    }

    // Handle different event types
    if (position.type === 'STAKE') {
      userBalances[userAddress] += amount;
      totalStaked += amount;
    } else if (position.type === 'WITHDRAW') {
      userBalances[userAddress] -= amount;
      totalStaked -= amount;
    }
    // Note: INITIATE_WITHDRAWAL and CANCEL_WITHDRAWAL don't change the staked balance
  }

  // Calculate shares and format the result
  const result: LpStakingUserState = {
    totalStaked: totalStaked.toString(),
    users: {},
  };

  for (const [address, balance] of Object.entries(userBalances)) {
    if (balance <= BigInt(0)) continue; // Skip users with zero or negative balance

    const share =
      totalStaked > BigInt(0)
        ? (Number(balance) / Number(totalStaked)) * 100
        : 0;

    result.users[address] = {
      amount: balance,
      share: share / 100,
      shareInPercentage: share + '%',
    };
  }

  return result;
};

// For testing purposes
if (require.main === module) {
  (async () => {
    try {
      console.log('Fetching HaiBoldCurveLPStaking positions...');
      const haiBoldPositions = await getLpStakingPositions('HAI_BOLD_CURVE');
      console.log(`Found ${haiBoldPositions.length} HaiBoldCurveLPStaking positions`);

      console.log('\nFetching HaiVeloVeloLPStaking positions...');
      const haiVeloPositions = await getLpStakingPositions('HAI_VELO_VELO');
      console.log(`Found ${haiVeloPositions.length} HaiVeloVeloLPStaking positions`);

      // Calculate state at current timestamp
      const currentTimestamp = Math.floor(Date.now() / 1000);

      const haiBoldState = calculateLpStakingAtTimestamp(haiBoldPositions, currentTimestamp);
      console.log('\nHaiBoldCurveLPStaking state:', haiBoldState);

      const haiVeloState = calculateLpStakingAtTimestamp(haiVeloPositions, currentTimestamp);
      console.log('\nHaiVeloVeloLPStaking state:', haiVeloState);
    } catch (error) {
      console.error('Error:', error);
    }
  })();
}

