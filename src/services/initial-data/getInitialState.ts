import { UserList, UserAccount } from "../../types";
import { getInitialLpPosition } from "./getInitialLpPosition";
import { getInitialSafesDebt } from "./getInitialSafesDebt";
import { getExclusionList } from "../../utils/getExclusionList";
import { getPoolState } from "../pool/getPoolState";
import { getRedemptionPriceFromBlock } from "../oracle/getRedemptionPrice";
import { getStakingWeight } from "../staking/getStakingWeight";
import { getOrCreateUser } from "../../utils/getOrCreateUser";
import { config } from "../../config";

const addLpPositionsToUsers = (users: UserList, positions: ReturnType<typeof getInitialLpPosition>): UserList =>
  Object.entries(positions).reduce((acc, [addr, positionData]) => {
    const [newAcc, user] = getOrCreateUser(addr, acc);
    return { ...newAcc, [addr]: { ...user, lpPositions: positionData.positions } };
  }, users);

const addDebtsToUsers = (users: UserList, debts: ReturnType<typeof getInitialSafesDebt>): UserList =>
  debts.reduce((acc, debt) => {
    const [newAcc, user] = getOrCreateUser(debt.address, acc);
    return { ...newAcc, [debt.address]: { ...user, debt: (user.debt || 0) + debt.debt } };
  }, users);

const removeExcludedUsers = (users: UserList, exclusionList: string[]): UserList =>
  Object.fromEntries(Object.entries(users).filter(([address]) => !exclusionList.includes(address)));

const setInitialStakingWeights = (
  users: UserList,
  poolState: ReturnType<typeof getPoolState>,
  redemptionPrice: number
): UserList =>
  Object.fromEntries(
    Object.entries(users).map(([address, user]) => [
      address,
      {
        ...user,
        stakingWeight: getStakingWeight(
          user.debt,
          user.lpPositions,
          poolState.sqrtPrice,
          redemptionPrice
        ),
      },
    ])
  );

const validateUsers = (users: UserList): void => {
  Object.values(users).forEach(user => {
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
  owners: Map<string, string>
): Promise<UserList> => {
  const positions = await getInitialLpPosition(startBlock, config().UNISWAP_POOL_ADDRESS, config().SUBGRAPH_URL);
  const debts = await getInitialSafesDebt(startBlock, owners, config().COLLATERAL_TYPES, config().SUBGRAPH_URL);
  
  console.log(`Fetched ${debts.length} debt balances`);

  let users: UserList = {};
  users = addLpPositionsToUsers(users, positions);
  console.log(`Fetched ${Object.keys(users).length} LP positions`);
  
  users = addDebtsToUsers(users, debts);

  const exclusionList = await getExclusionList();
  users = removeExcludedUsers(users, exclusionList);

  const poolState = await getPoolState(startBlock, config().UNISWAP_POOL_ADDRESS);
  const redemptionPrice = await getRedemptionPriceFromBlock(startBlock);

  users = setInitialStakingWeights(users, poolState, redemptionPrice);

  validateUsers(users);

  console.log(`Finished loading initial state for ${Object.keys(users).length} users`);
  return users;
};

