import { subgraphQueryPaginated } from "../subgraph/utils";
import { config } from "../../config";

const query = `
  {
    stakingPositions(first: 1000, skip: [[skip]]){
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

export type StakingPostion = {
  id: string;
  user: {
    id: string;
  };
  amount: string;
  timestamp: string;
  transactionHash: string;
  type: string;
};

export interface StakingState {
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
 * Calculate the total staking amount and each user's share at a specific timestamp
 * @param positions Array of staking positions
 * @param timestamp Unix timestamp to calculate balances at
 * @returns Object with total staked and user shares
 */
export const calculateStakingAtTimestamp = (
  positions: StakingPostion[],
  timestamp: number
): StakingState => {
  // Sort positions by timestamp
  const sortedPositions = [...positions]
    .sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp))
    .filter((position) => parseInt(position.timestamp) <= timestamp);

  let totalStaked = BigInt(0);
  const userBalances: { [address: string]: bigint } = {};

  // Process all positions up to the specified timestamp
  for (const position of sortedPositions) {
    if (parseInt(position.timestamp) > timestamp) continue;

    const userAddress = position.user.id;
    const amount = BigInt(position.amount);

    // Initialize user balance if needed
    if (!userBalances[userAddress]) {
      userBalances[userAddress] = BigInt(0);
    }

    // Handle different event types
    if (position.type === "STAKE") {
      userBalances[userAddress] += amount;
      totalStaked += amount;
    } else if (position.type === "WITHDRAW") {
      userBalances[userAddress] -= amount;
      totalStaked -= amount;
    }
  }

  // Calculate shares and format the result
  const result: StakingState = {
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
      shareInPercentage: share + "%",
    };
  }

  return result;
};

export const getStakingPositions = async () => {
  const stakingPositions = (await subgraphQueryPaginated(
    query,
    "stakingPositions",
    config().STKITE_SUBGRAPH_URL
  )) as StakingPostion[];

  return stakingPositions;
};

const main = async () => {
  try {
    const stakingPositions = (await subgraphQueryPaginated(
      query,
      "stakingPositions",
      config().STKITE_SUBGRAPH_URL
    )) as StakingPostion[];

    const relevantPositions = stakingPositions.filter(
      (position) => position.type === "STAKE" || position.type === "WITHDRAW"
    );

    // Example: Calculate staking at current timestamp
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const stakingState = calculateStakingAtTimestamp(
      relevantPositions,
      1746142739
    );

    console.log(stakingState);
  } catch (error) {
    console.error("Error fetching staking positions:", error);
  }
};

// Helper function to format large amounts for readability
const formatAmount = (amountStr: string): string => {
  const amount = BigInt(amountStr);
  return (Number(amount) / 1e18).toFixed(4) + " tokens";
};

if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error in main:", error);
    process.exit(1);
  });
}
