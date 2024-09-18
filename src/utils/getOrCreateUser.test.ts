// getOrCreateUser.test.ts

import { getOrCreateUser } from "./getOrCreateUser";
import { UserList, UserAccount } from "../types";

describe("getOrCreateUser", () => {
  let userList: UserList;

  beforeEach(() => {
    userList = {};
  });

  it("should create a new user if one does not exist", () => {
    const address = "0xUserAddress";
    const user = getOrCreateUser(address, userList);

    expect(userList[address]).toBeDefined();
    expect(user).toBe(userList[address]);
    expect(user).toEqual({
      debt: 0,
      lpPositions: [],
      stakingWeight: 0,
      earned: 0,
      rewardPerWeightStored: 0,
    });
  });

  it("should return the existing user if one already exists", () => {
    const address = "0xUserAddress";
    const existingUser: UserAccount = {
      debt: 100,
      lpPositions: [
        { tokenId: 1, liquidity: 500, lowerTick: 10, upperTick: 20 },
      ],
      stakingWeight: 150,
      earned: 10,
      rewardPerWeightStored: 5,
    };
    userList[address] = existingUser;

    const user = getOrCreateUser(address, userList);

    expect(user).toBe(existingUser);
    expect(userList[address]).toBe(existingUser);
  });

  it("should not modify existing user when called again", () => {
    const address = "0xUserAddress";
    const existingUser: UserAccount = {
      debt: 100,
      lpPositions: [
        { tokenId: 1, liquidity: 500, lowerTick: 10, upperTick: 20 },
      ],
      stakingWeight: 150,
      earned: 10,
      rewardPerWeightStored: 5,
    };
    userList[address] = existingUser;

    const user = getOrCreateUser(address, userList);

    expect(user).toBe(existingUser);

    // Modify user
    user.debt += 50;
    user.earned += 5;

    const userAgain = getOrCreateUser(address, userList);

    expect(userAgain).toBe(user);
    expect(userAgain.debt).toBe(150);
    expect(userAgain.earned).toBe(15);
  });
});
