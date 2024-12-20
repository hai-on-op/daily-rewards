import { UserList, UserAccount, UserPositions } from "../../types";
import { getInitialLpPosition } from "./getInitialLpPosition";
import { getInitialSafesDebt, ProcessedDebt } from "./getInitialSafesDebt";
import { getExclusionList } from "../../utils/getExclusionList";
import { getPoolState, PoolState } from "../pool-state/getPoolState";
import { getRedemptionPriceFromBlock } from "../redemption-price/getRedemptionPrice";
import {
  getStakingWeightForDebt,
  getStakingWeightForLPPositions,
} from "../staking-weights/getStakingWeight";
import { getOrCreateUser } from "../../utils/getOrCreateUser";
import { config } from "../../config";

export type RewardType = "LP_REWARDS" | "MINTER_REWARDS";

export interface StakingWeightConfig {
  type: RewardType;
  withBridge?: boolean;
}

export const addLpPositionsToUsers = (
  users: UserList,
  positions: UserPositions
): UserList =>
  Object.entries(positions).reduce((acc, [addr, positionData]) => {
    const [newAcc, user] = getOrCreateUser(addr, acc);
    return {
      ...newAcc,
      [addr]: { ...user, lpPositions: positionData.positions },
    };
  }, users);

export const addDebtsToUsers = (
  users: UserList,
  debts: ProcessedDebt[]
): UserList =>
  debts.reduce((acc, debt) => {
    const [newAcc, user] = getOrCreateUser(debt.address, acc);
    return {
      ...newAcc,
      [debt.address]: { ...user, debt: (user.debt || 0) + debt.debt },
    };
  }, users);

export const removeExcludedUsers = (
  users: UserList,
  exclusionList: string[]
): UserList =>
  Object.fromEntries(
    Object.entries(users).filter(
      ([address]) => !exclusionList.includes(address)
    )
  );

export const setInitialStakingWeights = (
  users: UserList,
  poolState: PoolState,
  redemptionPrice: number,
  stakingConfig: StakingWeightConfig
): UserList =>
  Object.fromEntries(
    Object.entries(users).map(([address, user]) => [
      address,
      {
        ...user,
        stakingWeight: calculateStakingWeight(user, stakingConfig),
      },
    ])
  );

export const calculateStakingWeight = (
  user: UserAccount,
  config: StakingWeightConfig
): number => {
  switch (config.type) {
    case "LP_REWARDS":
      return getStakingWeightForLPPositions(user.lpPositions);
    case "MINTER_REWARDS":
      return getStakingWeightForDebt(
        user.debt,
        user.collateral,
        user.totalBridgedTokens - user.usedBridgedTokens, // effectiveBridgedTokens
        config.withBridge
      );
    default:
      throw new Error(`Unknown reward type: ${config.type}`);
  }
};

export const validateUsers = (users: UserList): void => {
  Object.values(users).forEach((user) => {
    if (
      user.debt === undefined ||
      user.earned === undefined ||
      user.lpPositions === undefined ||
      user.rewardPerWeightStored === undefined ||
      user.stakingWeight === undefined
    ) {
      throw Error(`Inconsistent initial state user ${JSON.stringify(user)}`);
    }
  });
};

export const getInitialState = async (
  startBlock: number,
  endBlock: number,
  owners: Map<string, string>,
  stakingConfig: StakingWeightConfig,
  gebSubgraph?: string,
  cType?: string
): Promise<UserList> => {
  console.log("geb subgrpah", gebSubgraph);

  const gebSubgraphUrl = gebSubgraph || config().GEB_SUBGRAPH_URL;



  let users: UserList = {};

  if (stakingConfig.type === "LP_REWARDS") {
    const positions = await getInitialLpPosition(
      startBlock,
      config().UNISWAP_POOL_ADDRESS,
      config().UNISWAP_SUBGRAPH_URL
    );

    users = addLpPositionsToUsers(users, positions);
    console.log(`Fetched ${Object.keys(users).length} LP positions`);
  }

  if (stakingConfig.type === "MINTER_REWARDS") {
    const debts = await getInitialSafesDebt(
      startBlock,
      owners,
      config().COLLATERAL_TYPES,
      gebSubgraphUrl,
      cType
    );

    console.log(`Fetched ${debts.length} debt balances`);

    
    users = addDebtsToUsers(users, debts);
    console.log(`Fetched ${Object.keys(users).length} debt balances`);
  }

  console.log(config().EXCLUSION_LIST_FILE);

  const exclusionList = await getExclusionList(config().EXCLUSION_LIST_FILE);
  users = removeExcludedUsers(users, exclusionList);

  const poolState = await getPoolState(
    startBlock,
    config().UNISWAP_POOL_ADDRESS,
    config().UNISWAP_SUBGRAPH_URL
  );
  const redemptionPrice = await getRedemptionPriceFromBlock(
    startBlock,
    gebSubgraphUrl
  );

  users = setInitialStakingWeights(
    users,
    poolState,
    redemptionPrice,
    stakingConfig
  );

  validateUsers(users);

  console.log(
    `Finished loading initial state for ${Object.keys(users).length} users`
  );
  return users;
};
