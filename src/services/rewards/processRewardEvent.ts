import { config } from "../../config";
import { provider } from "../../utils/chain";
import { getPoolState } from "../pool-state/getPoolState";
import { getRedemptionPriceFromTimestamp } from "../redemption-price/getRedemptionPrice";
import { getAccumulatedRate } from "../initial-data/getAccumulatedRate";
import {
  RewardEvent,
  RewardEventType,
  UserAccount,
  UserList,
  Rates,
  LpPosition,
} from "../../types";
import {
  getStakingWeightForDebt,
  getStakingWeightForLPPositions,
} from "../staking-weights/getStakingWeight";
import { getOrCreateUser } from "../../utils/getOrCreateUser";

//import { getBridgedTokensAtBlock } from "../bridge/getBridgedTokensAtBlock";
//import { sanityCheckAllUsers } from "../../utils/sanityChecks";

// TODO: add sanity checks
// TODO: add bridge tokens

type RewardConfig = {
  type: "LP_REWARDS" | "MINTER_REWARDS";
  startBlock: number;
  endBlock: number;
  rewardAmount: number;
  withBridge?: boolean;
  cTypes: string[];
};

interface RewardState {
  timestamp: number;
  totalStakingWeight: number;
  rewardPerWeight: number;
  rates: Rates;
  sqrtPrice: number;
  redemptionPrice: number;
  redemptionPriceLastUpdate: number;
}

const systemConfig = config();

export const processRewardEvent = async (
  users: UserList,
  events: RewardEvent[],
  config: RewardConfig
): Promise<UserList> => {
  // Initialize state
  const initialState = await initializeRewardState(config);

  // Process events
  const finalState = await processEvents(users, events, initialState, config);

  // Final crediting
  return creditFinalRewards(users, finalState, config);
};

const initializeRewardState = async (
  config: RewardConfig
): Promise<RewardState> => {
  const startTimestamp = (await provider.getBlock(config.startBlock)).timestamp;

  // Initialize rates for all collateral types
  const rates: Rates = {};
  for (const cType of config.cTypes) {
    rates[cType] = await getAccumulatedRate(
      config.startBlock,
      cType,
      systemConfig.GEB_SUBGRAPH_URL
    );
  }

  const poolState = await getPoolState(
    config.startBlock,
    systemConfig.UNISWAP_POOL_ADDRESS,
    systemConfig.UNISWAP_SUBGRAPH_URL
  );
  const sqrtPrice = Number(poolState.sqrtPrice);

  return {
    timestamp: startTimestamp,
    totalStakingWeight: 0,
    rewardPerWeight: 0,
    rates,
    sqrtPrice,
    redemptionPrice: 1,
    redemptionPriceLastUpdate: 0,
  };
};

const processEvents = async (
  users: UserList,
  events: RewardEvent[],
  state: RewardState,
  config: RewardConfig
): Promise<RewardState> => {
  let currentState = { ...state };

  for (const event of events) {
    // Update redemption price if needed
    if (currentState.redemptionPriceLastUpdate + 3600 * 24 <= event.timestamp) {
      currentState.redemptionPrice = await getRedemptionPriceFromTimestamp(
        event.timestamp
      );
      currentState.redemptionPriceLastUpdate = event.timestamp;
    }

    // Update rewards
    currentState = updateRewardPerWeight(currentState, event.timestamp, config);

    // Process event based on type
    currentState = await processEvent(users, event, currentState, config);

    // Sanity check
    // TODO!!!
    //sanityCheckAllUsers(users, event);

    // Update total staking weight
    currentState.totalStakingWeight = sumAllWeights(users);
  }

  return currentState;
};

const processEvent = async (
  users: UserList,
  event: RewardEvent,
  state: RewardState,
  config: RewardConfig
): Promise<RewardState> => {
  const newState = { ...state };

  switch (event.type) {
    case RewardEventType.DELTA_DEBT:
      await handleDeltaDebt(users, event, newState, config);
      break;

    case RewardEventType.POOL_POSITION_UPDATE:
      await handlePoolPositionUpdate(users, event, newState);
      break;

    case RewardEventType.POOL_SWAP:
      await handlePoolSwap(users, event, newState);
      break;

    case RewardEventType.UPDATE_ACCUMULATED_RATE:
      await handleAccumulatedRate(users, event, newState, config);
      break;

    default:
      throw Error("Unknown event");
  }

  return newState;
};

const handlePoolPositionUpdate = async (
  users: UserList,
  event: RewardEvent,
  state: RewardState
) => {
  const updatedPosition = event.value as LpPosition;
  const [newUsers, user] = getOrCreateUser(event.address ?? "", users);
  earn(user, state.rewardPerWeight);

  // Handle NFT transfers
  for (const [address, existingUser] of Object.entries(users)) {
    for (let i = 0; i < existingUser.lpPositions.length; i++) {
      if (
        existingUser.lpPositions[i].tokenId === updatedPosition.tokenId &&
        address !== event.address
      ) {
        earn(existingUser, state.rewardPerWeight);
        existingUser.lpPositions = existingUser.lpPositions.filter(
          (x) => x.tokenId !== updatedPosition.tokenId
        );
        updateUserStakingWeight(existingUser, state, {
          type: "LP_REWARDS",
        } as RewardConfig);
      }
    }
  }

  // Update or create position
  const index = user.lpPositions.findIndex(
    (p) => p.tokenId === updatedPosition.tokenId
  );
  if (index === -1) {
    user.lpPositions.push(updatedPosition);
  } else {
    if (
      user.lpPositions[index].lowerTick !== updatedPosition.lowerTick ||
      user.lpPositions[index].upperTick !== updatedPosition.upperTick
    ) {
      throw Error("Tick value can't be updated");
    }
    user.lpPositions[index].liquidity = updatedPosition.liquidity;
  }

  updateUserStakingWeight(user, state, { type: "LP_REWARDS" } as RewardConfig);
};

const handlePoolSwap = async (
  users: UserList,
  event: RewardEvent,
  state: RewardState
): Promise<RewardState> => {
  const newState = { ...state };

  // Credit all users before price update
  Object.values(users).forEach((user) => earn(user, state.rewardPerWeight));

  // Update price
  newState.sqrtPrice = event.value as number;

  // Update all users' weights with new price
  Object.values(users).forEach((user) =>
    updateUserStakingWeight(user, newState, {
      type: "LP_REWARDS",
    } as RewardConfig)
  );

  return newState;
};

const handleAccumulatedRate = async (
  users: UserList,
  event: RewardEvent,
  state: RewardState,
  config: RewardConfig
): Promise<RewardState> => {
  const newState = { ...state };
  const rateMultiplier = event.value as number;
  const cType = event.cType as string;

  // Update rate
  newState.rates[cType] = (newState.rates[cType] || 0) + rateMultiplier;

  // Credit all users before update
  Object.values(users).forEach((user) => earn(user, state.rewardPerWeight));

  // Update all users' debt and weights
  Object.values(users).forEach((user) => {
    user.debt *= rateMultiplier + 1;
    updateUserStakingWeight(user, newState, config);
  });

  return newState;
};

const creditFinalRewards = (
  users: UserList,
  state: RewardState,
  config: RewardConfig
): UserList => {
  const endTimestamp = state.timestamp;
  const newState = updateRewardPerWeight(state, endTimestamp, config);

  Object.values(users).forEach((user) => earn(user, newState.rewardPerWeight));

  return users;
};

// Helper functions for event processing
const handleDeltaDebt = async (
  users: UserList,
  event: RewardEvent,
  state: RewardState,
  config: RewardConfig
) => {
  const [newUsers, user] = getOrCreateUser(event.address ?? "", users);
  earn(user, state.rewardPerWeight);

  if (config.type === "MINTER_REWARDS" && config.withBridge) {
    // TODO!!!
    //user.totalBridgedTokens = await getBridgedTokensAtBlock(
    //  event.address,
    //  event.cType,
    //  event.createdAtBlock
    //);
    user.totalBridgedTokens = 0;
  }

  const accumulatedRate = state.rates[event.cType as string];
  const adjustedDeltaDebt = (event.value as number) * accumulatedRate;
  user.debt += adjustedDeltaDebt;

  if (user.debt < 0 && user.debt > -0.4) {
    user.debt = 0;
  }

  updateUserStakingWeight(user, state, config);
};

// Helper functions
const earn = (user: UserAccount, rewardPerWeight: number): void => {
  user.earned +=
    (rewardPerWeight - user.rewardPerWeightStored) * user.stakingWeight;
  user.rewardPerWeightStored = rewardPerWeight;
};

const sumAllWeights = (users: UserList): number =>
  Object.values(users).reduce((acc, user) => acc + user.stakingWeight, 0);

const updateRewardPerWeight = (
  state: RewardState,
  eventTime: number,
  config: RewardConfig
): RewardState => {
  const newState = { ...state };
  if (newState.totalStakingWeight > 0) {
    const deltaTime = eventTime - newState.timestamp;
    // Calculate reward rate per second based on total time period
    const rewardRate = config.rewardAmount / deltaTime;
    newState.rewardPerWeight +=
      (deltaTime * rewardRate) / newState.totalStakingWeight;
  }
  newState.timestamp = eventTime;
  return newState;
};

const updateUserStakingWeight = (
  user: UserAccount,
  state: RewardState,
  config: RewardConfig
): void => {
  user.stakingWeight =
    config.type === "LP_REWARDS"
      ? getStakingWeightForLPPositions(user.lpPositions)
      : getStakingWeightForDebt(
          user.debt,
          user.collateral,
          user.totalBridgedTokens - user.usedBridgedTokens,
          config.withBridge
        );
};
