// getOrCreateUser.ts

import { UserList, UserAccount } from "../types";

/**
 * Creates a new user account with default values.
 *
 * @param {string} address - The user's address.
 * @returns {UserAccount} A new user account.
 */
const createNewUser = (address: string): UserAccount => ({
  address,
  debt: 0,
  collateral: 0,
  lpPositions: [],
  stakingWeight: 0,
  earned: 0,
  rewardPerWeightStored: 0,
  totalBridgedTokens: 0,
  usedBridgedTokens: 0,
});

/**
 * Retrieves an existing user account from the user list or creates a new one with default values.
 * Returns a new UserList along with the user account.
 *
 * @param {string} address - The user's address.
 * @param {UserList} userList - The collection of user accounts indexed by address.
 * @returns {[UserList, UserAccount]} A tuple containing the updated UserList and the user account.
 */
export const getOrCreateUser = (
  address: string,
  userList: UserList
): [UserList, UserAccount] => {
  if (address in userList) {
    return [userList, userList[address]];
  } else {
    const newUser = createNewUser(address);
    return [{ ...userList, [address]: newUser }, newUser];
  }
};

export const getOrCreateUserMutate = (
  address: string,
  userList: UserList
): UserAccount => {
  if (userList[address]) {
    return userList[address];
  } else {
    const newUser = createNewUser(address);

    userList[address] = newUser;
    return newUser;
  }
};
