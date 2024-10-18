import { getOrCreateUser } from "./getOrCreateUser";
import { UserList, UserAccount } from "../types";

describe("getOrCreateUser", () => {
  let userList: UserList;

  beforeEach(() => {
    userList = {};
  });

  it("should return the existing user and unchanged userList if the address is already in the userList", () => {
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
    userList = { "0x123": existingUser };

    const [newUserList, result] = getOrCreateUser("0x123", userList);

    expect(result).toBe(existingUser);
    expect(newUserList).toBe(userList);
    expect(Object.keys(newUserList).length).toBe(1);
  });

  it("should create and return a new user and updated userList if the address is not in the userList", () => {
    const [newUserList, result] = getOrCreateUser("0xABC", userList);

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
    expect(newUserList).not.toBe(userList);
    expect(newUserList["0xABC"]).toBe(result);
    expect(Object.keys(newUserList).length).toBe(1);
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
    userList = { "0x123": existingUser };

    const [newUserList, _] = getOrCreateUser("0xABC", userList);

    expect(newUserList["0x123"]).toEqual(existingUser);
    expect(Object.keys(newUserList).length).toBe(2);
    expect(newUserList).not.toBe(userList);
  });

  it("should return the same user object for repeated calls with the same address", () => {
    const [userList1, user1] = getOrCreateUser("0xDEF", userList);
    const [userList2, user2] = getOrCreateUser("0xDEF", userList1);

    expect(user1).toBe(user2);
    expect(userList2).toBe(userList1);
    expect(Object.keys(userList2).length).toBe(1);
  });
});
