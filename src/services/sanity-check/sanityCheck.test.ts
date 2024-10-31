import { finalSanityChecks, sanityCheckAllUsers } from "./sanityCheck";
import { provider } from "../../utils/chain";
import { RewardEvent, RewardEventType, UserList } from "../../types";

// Mock provider
jest.mock("../../utils/chain", () => ({
  provider: {
    getBlock: jest.fn(),
  },
}));

describe("Sanity Checks", () => {
  describe("finalSanityChecks", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should calculate total allocated rewards correctly", async () => {
      const mockUsers: UserList = {
        "0x1": {
          address: "0x1",
          debt: 100,
          lpPositions: [],
          stakingWeight: 100,
          earned: 50,
          rewardPerWeightStored: 0.5,
          collateral: 1000,
          totalBridgedTokens: 500,
          usedBridgedTokens: 0,
        },
        "0x2": {
          address: "0x2",
          debt: 200,
          lpPositions: [],
          stakingWeight: 200,
          earned: 100,
          rewardPerWeightStored: 0.5,
          collateral: 2000,
          totalBridgedTokens: 1000,
          usedBridgedTokens: 0,
        },
      };

      (provider.getBlock as jest.Mock).mockResolvedValue({ timestamp: 2000 });

      const consoleSpy = jest.spyOn(console, 'log');
      await finalSanityChecks(1500, mockUsers, 200);

      expect(consoleSpy).toHaveBeenCalledWith(
        "All events applied, total allocated reward 150"
      );
    });

    it("should throw error if final timestamp is after end block", async () => {
      const mockUsers: UserList = {
        "0x1": {
          address: "0x1",
          debt: 100,
          lpPositions: [],
          stakingWeight: 100,
          earned: 50,
          rewardPerWeightStored: 0.5,
          collateral: 1000,
          totalBridgedTokens: 500,
          usedBridgedTokens: 0,
        },
      };

      (provider.getBlock as jest.Mock).mockResolvedValue({ timestamp: 1000 });

      await expect(finalSanityChecks(2000, mockUsers, 200))
        .rejects
        .toThrow("Impossible final timestamp");
    });
  });

  describe("sanityCheckAllUsers", () => {
    const validUser = {
      address: "0x1",
      debt: 100,
      lpPositions: [
        {
          tokenId: 1,
          liquidity: 1000,
          lowerTick: -887220,
          upperTick: 887220,
        },
      ],
      stakingWeight: 100,
      earned: 50,
      rewardPerWeightStored: 0.5,
      collateral: 1000,
      totalBridgedTokens: 500,
      usedBridgedTokens: 0,
    };

    it("should pass for valid user data", () => {
      const users: UserList = {
        "0x1": validUser,
      };

      const event: RewardEvent = {
        type: RewardEventType.DELTA_DEBT,
        value: 100,
        address: "0x1",
        logIndex: 1,
        timestamp: 1000,
        createdAtBlock: 100,
      };

      expect(() => sanityCheckAllUsers(users, event)).not.toThrow();
    });

    it("should throw for negative debt", () => {
      const users: UserList = {
        "0x1": { ...validUser, debt: -100 },
      };

      const event: RewardEvent = {
        type: RewardEventType.DELTA_DEBT,
        value: 100,
        address: "0x1",
        logIndex: 1,
        timestamp: 1000,
        createdAtBlock: 100,
      };

      expect(() => sanityCheckAllUsers(users, event)).toThrow();
    });

    it("should throw for infinite staking weight", () => {
      const users: UserList = {
        "0x1": { ...validUser, stakingWeight: Infinity },
      };

      const event: RewardEvent = {
        type: RewardEventType.DELTA_DEBT,
        value: 100,
        address: "0x1",
        logIndex: 1,
        timestamp: 1000,
        createdAtBlock: 100,
      };

      expect(() => sanityCheckAllUsers(users, event)).toThrow();
    });

    it("should throw for invalid LP position", () => {
      const users: UserList = {
        "0x1": {
          ...validUser,
          lpPositions: [
            {
              tokenId: 1,
              liquidity: -1000,
              lowerTick: -887220,
              upperTick: 887220,
            },
          ],
        },
      };

      const event: RewardEvent = {
        type: RewardEventType.POOL_POSITION_UPDATE,
        value: {
          tokenId: 1,
          liquidity: 1000,
          lowerTick: -887220,
          upperTick: 887220,
        },
        address: "0x1",
        logIndex: 1,
        timestamp: 1000,
        createdAtBlock: 100,
      };

      expect(() => sanityCheckAllUsers(users, event)).toThrow();
    });

    it("should throw for infinite ticks", () => {
      const users: UserList = {
        "0x1": {
          ...validUser,
          lpPositions: [
            {
              tokenId: 1,
              liquidity: 1000,
              lowerTick: -Infinity,
              upperTick: Infinity,
            },
          ],
        },
      };

      const event: RewardEvent = {
        type: RewardEventType.POOL_POSITION_UPDATE,
        value: {
          tokenId: 1,
          liquidity: 1000,
          lowerTick: -887220,
          upperTick: 887220,
        },
        address: "0x1",
        logIndex: 1,
        timestamp: 1000,
        createdAtBlock: 100,
      };

      expect(() => sanityCheckAllUsers(users, event)).toThrow();
    });

    it("should ignore events without address", () => {
      const users: UserList = {
        "0x1": {
          ...validUser,
          stakingWeight: Infinity,
        },
      };

      const event: RewardEvent = {
        type: RewardEventType.POOL_SWAP,
        value: 1000000,
        logIndex: 1,
        timestamp: 1000,
        createdAtBlock: 100,
      };

      expect(() => sanityCheckAllUsers(users, event)).not.toThrow();
    });

    it("should ignore NULL_ADDRESS events", () => {
      const users: UserList = {
        "0x1": {
          ...validUser,
          stakingWeight: Infinity,
        },
      };

      const event: RewardEvent = {
        type: RewardEventType.DELTA_DEBT,
        value: 100,
        address: "0x0000000000000000000000000000000000000000",
        logIndex: 1,
        timestamp: 1000,
        createdAtBlock: 100,
      };

      expect(() => sanityCheckAllUsers(users, event)).not.toThrow();
    });
  });
}); 