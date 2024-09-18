// getOrCreateUser.ts

import { UserList, UserAccount } from "../types";

/**
 * Retrieves an existing user account from the user list or creates a new one with default values.
 *
 * @param {string} address - The user's address.
 * @param {UserList} userList - The collection of user accounts indexed by address.
 * @returns {UserAccount} The user account associated with the address.
 */
export const getOrCreateUser = (
  address: string,
  userList: UserList
): UserAccount => {
  if (userList[address]) {
    return userList[address];
  } else {
    const newUser: UserAccount = {
      debt: 0,
      lpPositions: [],
      stakingWeight: 0,
      earned: 0,
      rewardPerWeightStored: 0,
    };
    userList[address] = newUser;
    return newUser;
  }
};
