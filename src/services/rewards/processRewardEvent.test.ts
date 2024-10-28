import { processRewardEvent } from "./processRewardEvent";
import { getPoolState } from "../pool-state/getPoolState";
import { getRedemptionPriceFromTimestamp } from "../redemption-price/getRedemptionPrice";
import { getAccumulatedRate } from "../initial-data/getAccumulatedRate";
import { config } from "../../config";
import { RewardEventType, UserList, UserAccount } from "../../types";

// Mock external dependencies
jest.mock("../pool-state/getPoolState");
jest.mock("../redemption-price/getRedemptionPrice");
jest.mock("../initial-data/getAccumulatedRate");
jest.mock("../../utils/chain");
jest.mock("../../config", () => ({
  __esModule: true,
  config: jest.fn().mockReturnValue({
    UNISWAP_POOL_ADDRESS: "0xpool",
    GEB_SUBGRAPH_URL: "https://geb.subgraph",
    UNISWAP_SUBGRAPH_URL: "https://uni.subgraph",
    RPC_URL: "https://mock.rpc",
  })
}));

describe("processRewardEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPoolState as jest.Mock).mockResolvedValue({ sqrtPrice: "1000000" });
    (getRedemptionPriceFromTimestamp as jest.Mock).mockResolvedValue(1.5);
    (getAccumulatedRate as jest.Mock).mockResolvedValue(1.1);
  });

  describe("LP Rewards", () => {
    const lpConfig = {
      type: "LP_REWARDS" as const,
      startBlock: 100,
      endBlock: 200,
      rewardAmount: 1000,
      cTypes: ["ETH-A"],
    };

    it("should process pool position updates", async () => {
      const users: UserList = {
        "0x1": {
          address: "0x1",
          debt: 0,
          lpPositions: [],
          stakingWeight: 0,
          earned: 0,
          rewardPerWeightStored: 0,
          collateral: 0,
          totalBridgedTokens: 0,
          usedBridgedTokens: 0,
        },
      };

      const events = [
        {
          type: RewardEventType.POOL_POSITION_UPDATE,
          value: {
            tokenId: 1,
            liquidity: 1000,
            lowerTick: -887220,
            upperTick: 887220,
          },
          address: "0x1",
          logIndex: 1,
          timestamp: 1100,
          createdAtBlock: 150,
        },
      ];

      const result = await processRewardEvent(users, events, lpConfig);
      expect(result["0x1"].lpPositions).toHaveLength(1);
      expect(result["0x1"].stakingWeight).toBeGreaterThan(0);
    });

    it("should handle pool swaps", async () => {
      const users: UserList = {
        "0x1": {
          address: "0x1",
          debt: 0,
          lpPositions: [
            {
              tokenId: 1,
              liquidity: 1000,
              lowerTick: -887220,
              upperTick: 887220,
            },
          ],
          stakingWeight: 1000,
          earned: 0,
          rewardPerWeightStored: 0,
          collateral: 0,
          totalBridgedTokens: 0,
          usedBridgedTokens: 0,
        },
      };

      // Mock initial state with non-zero totalStakingWeight
      (getPoolState as jest.Mock).mockResolvedValueOnce({ sqrtPrice: "1000000" });
      
      const events = [
        {
          type: RewardEventType.POOL_SWAP,
          value: 2000000,
          logIndex: 1,
          timestamp: 2000, // Event timestamp
          createdAtBlock: 150,
        },
      ];

      // Mock the provider to return different timestamps for start and end blocks
      (provider.getBlock as jest.Mock)
        .mockResolvedValueOnce({ timestamp: 1000 }) // Start block timestamp
        .mockResolvedValueOnce({ timestamp: 3000 }); // End block timestamp

      const result = await processRewardEvent(users, events, {
        ...lpConfig,
        rewardAmount: 1000000,
      });

      expect(result["0x1"].earned).toBeGreaterThan(0);
    });
  });

  describe("Minter Rewards", () => {
    const minterConfig = {
      type: "MINTER_REWARDS" as const,
      startBlock: 100,
      endBlock: 200,
      rewardAmount: 1000,
      withBridge: true,
      cTypes: ["ETH-A"],
    };

    it("should process debt updates", async () => {
      const users: UserList = {
        "0x1": {
          address: "0x1",
          debt: 0,
          lpPositions: [],
          stakingWeight: 0,
          earned: 0,
          rewardPerWeightStored: 0,
          collateral: 1000,
          totalBridgedTokens: 500,
          usedBridgedTokens: 0,
        },
      };

      const events = [
        {
          type: RewardEventType.DELTA_DEBT,
          value: 100,
          complementaryValue: 200,
          address: "0x1",
          logIndex: 1,
          timestamp: 1100,
          createdAtBlock: 150,
          cType: "ETH-A",
        },
      ];

      const result = await processRewardEvent(users, events, minterConfig);
      expect(result["0x1"].debt).toBeGreaterThan(0);
      expect(result["0x1"].stakingWeight).toBeGreaterThan(0);
    });

    it("should handle accumulated rate updates", async () => {
      const users: UserList = {
        "0x1": {
          address: "0x1",
          debt: 100,
          lpPositions: [],
          stakingWeight: 100,
          earned: 0,
          rewardPerWeightStored: 0,
          collateral: 1000,
          totalBridgedTokens: 500,
          usedBridgedTokens: 0,
        },
      };

      const events = [
        {
          type: RewardEventType.UPDATE_ACCUMULATED_RATE,
          value: 0.1,
          logIndex: 1,
          timestamp: 1100,
          createdAtBlock: 150,
          cType: "ETH-A",
        },
      ];

      const result = await processRewardEvent(users, events, minterConfig);
      expect(result["0x1"].debt).toBeCloseTo(110, 10); // Using toBeCloseTo for floating point comparison
      expect(result["0x1"].earned).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty event list", async () => {
      const users: UserList = {
        "0x1": {
          address: "0x1",
          debt: 100,
          lpPositions: [],
          stakingWeight: 100,
          earned: 0,
          rewardPerWeightStored: 0,
          collateral: 1000,
          totalBridgedTokens: 500,
          usedBridgedTokens: 0,
        },
      };

      const result = await processRewardEvent(users, [], {
        type: "MINTER_REWARDS",
        startBlock: 100,
        endBlock: 200,
        rewardAmount: 1000,
        cTypes: ["ETH-A"],
      });

      expect(result["0x1"].earned).toBe(0);
    });

    it("should handle dust debt", async () => {
      const users: UserList = {
        "0x1": {
          address: "0x1",
          debt: 0,
          lpPositions: [],
          stakingWeight: 0,
          earned: 0,
          rewardPerWeightStored: 0,
          collateral: 1000,
          totalBridgedTokens: 500,
          usedBridgedTokens: 0,
        },
      };

      const events = [
        {
          type: RewardEventType.DELTA_DEBT,
          value: -0.3,
          address: "0x1",
          logIndex: 1,
          timestamp: 1100,
          createdAtBlock: 150,
          cType: "ETH-A",
        },
      ];

      const result = await processRewardEvent(users, events, {
        type: "MINTER_REWARDS",
        startBlock: 100,
        endBlock: 200,
        rewardAmount: 1000,
        cTypes: ["ETH-A"],
      });

      expect(result["0x1"].debt).toBe(0);
    });
  });

  describe("Reward Distribution", () => {
    it("should distribute rewards proportionally to staking weights", async () => {
      const users: UserList = {
        "0x1": {
          address: "0x1",
          debt: 100,
          lpPositions: [],
          stakingWeight: 100,
          earned: 0,
          rewardPerWeightStored: 0,
          collateral: 1000,
          totalBridgedTokens: 500,
          usedBridgedTokens: 0,
        },
        "0x2": {
          address: "0x2",
          debt: 200,
          lpPositions: [],
          stakingWeight: 200,
          earned: 0,
          rewardPerWeightStored: 0,
          collateral: 2000,
          totalBridgedTokens: 1000,
          usedBridgedTokens: 0,
        },
      };

      const events = [
        {
          type: RewardEventType.UPDATE_ACCUMULATED_RATE,
          value: 0.1,
          logIndex: 1,
          timestamp: 1100,
          createdAtBlock: 150,
          cType: "ETH-A",
        },
      ];

      const result = await processRewardEvent(users, events, {
        type: "MINTER_REWARDS",
        startBlock: 100,
        endBlock: 200,
        rewardAmount: 1000,
        cTypes: ["ETH-A"],
      });

      expect(result["0x2"].earned).toBeGreaterThan(result["0x1"].earned);
      expect(result["0x2"].earned / result["0x1"].earned).toBeCloseTo(2, 1);
    });
  });
});
