import { getOrCreateUser } from "./";
import { UserList, UserAccount } from "../types";

describe("getOrCreateUser", () => {
  let userList: UserList;

  beforeEach(() => {
    userList = {};
  });

  it("should return an existing user if the address is already in the userList", () => {
    const existingUser: UserAccount = {
      address: "0x123",
      debt: 100,
      collateral: 200,
      lpPositions: [],
      stakingWeight: 50,
      earned: 10,
      rewardPerWeightStored: 5,
      totalBridgedTokens: 1000,
      usedBridgedTokens: 500,
    };
    userList["0x123"] = existingUser;

    const result = getOrCreateUser("0x123", userList);

    expect(result).toBe(existingUser);
    expect(Object.keys(userList).length).toBe(1);
  });

  it("should create and return a new user if the address is not in the userList", () => {
    const result = getOrCreateUser("0xABC", userList);

    expect(result).toEqual({
      address: "0xABC",
      debt: 0,
      collateral: 0,
      lpPositions: [],
      stakingWeight: 0,
      earned: 0,
      rewardPerWeightStored: 0,
      totalBridgedTokens: 0,
      usedBridgedTokens: 0,
    });
    expect(userList["0xABC"]).toBe(result);
    expect(Object.keys(userList).length).toBe(1);
  });

  it("should not modify existing users when creating a new user", () => {
    const existingUser: UserAccount = {
      address: "0x123",
      debt: 100,
      collateral: 200,
      lpPositions: [],
      stakingWeight: 50,
      earned: 10,
      rewardPerWeightStored: 5,
      totalBridgedTokens: 1000,
      usedBridgedTokens: 500,
    };
    userList["0x123"] = existingUser;

    getOrCreateUser("0xABC", userList);

    expect(userList["0x123"]).toEqual(existingUser);
    expect(Object.keys(userList).length).toBe(2);
  });

  it("should return the same user object for repeated calls with the same address", () => {
    const user1 = getOrCreateUser("0xDEF", userList);
    const user2 = getOrCreateUser("0xDEF", userList);

    expect(user1).toBe(user2);
    expect(Object.keys(userList).length).toBe(1);
  });
});
