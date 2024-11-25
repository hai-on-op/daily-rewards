import {
  addLpPositionsToUsers,
  addDebtsToUsers,
  removeExcludedUsers,
  setInitialStakingWeights,
  validateUsers,
  getInitialState,
  calculateStakingWeight,
} from "./getInitialState";
import { getInitialLpPosition } from "./getInitialLpPosition";
import { getInitialSafesDebt } from "./getInitialSafesDebt";
import { getExclusionList } from "../../utils/getExclusionList";
import { getPoolState } from "../pool-state/getPoolState";
import { getRedemptionPriceFromBlock } from "../redemption-price/getRedemptionPrice";
import { UserList, UserAccount, UserPositions } from "../../types";
import { ProcessedDebt } from "./getInitialSafesDebt";
import { config } from "../../config";
import { StakingWeightConfig } from "./getInitialState";

// Mock external dependencies
jest.mock("./getInitialLpPosition");
jest.mock("./getInitialSafesDebt");
jest.mock("../../utils/getExclusionList");
jest.mock("../pool-state/getPoolState");
jest.mock("../redemption-price/getRedemptionPrice");
jest.mock("../../config");

describe("Initial State Module", () => {
  // Common test data
  const mockUserPositions: UserPositions = {
    "0x1": {
      positions: [
        { tokenId: 1, liquidity: 1000, lowerTick: -887220, upperTick: 887220 },
      ],
    },
    "0x2": {
      positions: [
        { tokenId: 2, liquidity: 2000, lowerTick: -887220, upperTick: 887220 },
      ],
    },
  };

  const mockDebts: ProcessedDebt[] = [
    { address: "0x1", debt: 100 },
    { address: "0x3", debt: 300 },
  ];

  const mockPoolState = {
    sqrtPrice: "1000000",
    tick: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (config as jest.Mock).mockReturnValue({
      UNISWAP_POOL_ADDRESS: "0xpool",
      GEB_SUBGRAPH_URL: "https://geb.subgraph",
      UNISWAP_SUBGRAPH_URL: "https://uni.subgraph",
      COLLATERAL_TYPES: ["ETH-A"],
      EXCLUSION_LIST_FILE: "exclusion.json",
    });
  });

  describe("addLpPositionsToUsers", () => {
    it("should add LP positions to empty user list", () => {
      const result = addLpPositionsToUsers({}, mockUserPositions);
      expect(result["0x1"].lpPositions).toEqual(mockUserPositions["0x1"].positions);
      expect(result["0x2"].lpPositions).toEqual(mockUserPositions["0x2"].positions);
    });

    it("should preserve existing user data when adding LP positions", () => {
      const existingUsers: UserList = {
        "0x1": {
          address: "0x1",
          debt: 100,
          lpPositions: [],
          stakingWeight: 0,
          earned: 0,
          rewardPerWeightStored: 0,
          collateral: 0,
          totalBridgedTokens: 0,
          usedBridgedTokens: 0,
        },
      };
      const result = addLpPositionsToUsers(existingUsers, mockUserPositions);
      expect(result["0x1"].debt).toBe(100);
      expect(result["0x1"].lpPositions).toEqual(mockUserPositions["0x1"].positions);
    });
  });

  describe("addDebtsToUsers", () => {
    it("should add debts to empty user list", () => {
      const result = addDebtsToUsers({}, mockDebts);
      expect(result["0x1"].debt).toBe(100);
      expect(result["0x3"].debt).toBe(300);
    });

    it("should accumulate debt for existing users", () => {
      const existingUsers: UserList = {
        "0x1": {
          address: "0x1",
          debt: 50,
          lpPositions: [],
          stakingWeight: 0,
          earned: 0,
          rewardPerWeightStored: 0,
          collateral: 0,
          totalBridgedTokens: 0,
          usedBridgedTokens: 0,
        },
      };
      const result = addDebtsToUsers(existingUsers, mockDebts);
      expect(result["0x1"].debt).toBe(150);
    });
  });

  describe("removeExcludedUsers", () => {
    it("should remove users in exclusion list", () => {
      const users: UserList = {
        "0x1": {} as UserAccount,
        "0x2": {} as UserAccount,
        "0x3": {} as UserAccount,
      };
      const exclusionList = ["0x2"];
      const result = removeExcludedUsers(users, exclusionList);
      expect(Object.keys(result)).toEqual(["0x1", "0x3"]);
    });
  });

  describe("setInitialStakingWeights", () => {
    const mockUsers: UserList = {
      "0x1": {
        address: "0x1",
        debt: 100,
        lpPositions: [{ tokenId: 1, liquidity: 1000, lowerTick: -887220, upperTick: 887220 }],
        stakingWeight: 0,
        earned: 0,
        rewardPerWeightStored: 0,
        collateral: 200,
        totalBridgedTokens: 150,
        usedBridgedTokens: 50,
      },
    };

    it("should set LP staking weights correctly", () => {
      const result = setInitialStakingWeights(
        mockUsers,
        mockPoolState,
        1.5,
        { type: "LP_REWARDS" }
      );
      expect(result["0x1"].stakingWeight).toBe(1000);
    });

    it("should set minter staking weights correctly", () => {
      const result = setInitialStakingWeights(
        mockUsers,
        mockPoolState,
        1.5,
        { type: "MINTER_REWARDS", withBridge: true }
      );
      expect(result["0x1"].stakingWeight).toBe(50);
    });
  });

  describe("validateUsers", () => {
    it("should not throw for valid users", () => {
      const validUsers: UserList = {
        "0x1": {
          address: "0x1",
          debt: 100,
          lpPositions: [],
          stakingWeight: 0,
          earned: 0,
          rewardPerWeightStored: 0,
          collateral: 0,
          totalBridgedTokens: 0,
          usedBridgedTokens: 0,
        },
      };
      expect(() => validateUsers(validUsers)).not.toThrow();
    });

    it("should throw for invalid users", () => {
      const invalidUsers = {
        "0x1": {
          address: "0x1",
          debt: 100,
          // Missing required fields
        },
      } as unknown as UserList;
      expect(() => validateUsers(invalidUsers)).toThrow();
    });
  });

  describe("getInitialState", () => {
    beforeEach(() => {
      (getInitialLpPosition as jest.Mock).mockResolvedValue(mockUserPositions);
      (getInitialSafesDebt as jest.Mock).mockResolvedValue(mockDebts);
      (getExclusionList as jest.Mock).mockResolvedValue([]);
      (getPoolState as jest.Mock).mockResolvedValue(mockPoolState);
      (getRedemptionPriceFromBlock as jest.Mock).mockResolvedValue(1.5);
    });

    /*it("should integrate all components correctly", async () => {
      const result = await getInitialState(
        1000,
        2000,
        new Map([["0x1", "0x1"]]),
        { type: "LP_REWARDS" }
      );

      expect(Object.keys(result)).toContain("0x1");
      expect(result["0x1"].lpPositions).toEqual(mockUserPositions["0x1"].positions);
      expect(result["0x1"].debt).toBe(100);
      expect(result["0x1"].stakingWeight).toBeDefined();
    });*/

    it("should handle empty data correctly", async () => {
      (getInitialLpPosition as jest.Mock).mockResolvedValue({});
      (getInitialSafesDebt as jest.Mock).mockResolvedValue([]);

      const result = await getInitialState(
        1000,
        2000,
        new Map(),
        { type: "LP_REWARDS" }
      );

      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe("calculateStakingWeight", () => {
    const mockUser: UserAccount = {
      address: "0x1",
      debt: 1000,
      lpPositions: [
        { tokenId: 1, liquidity: 2000, lowerTick: -887220, upperTick: 887220 },
        { tokenId: 2, liquidity: 3000, lowerTick: -887220, upperTick: 887220 },
      ],
      stakingWeight: 0,
      earned: 0,
      rewardPerWeightStored: 0,
      collateral: 2000,
      totalBridgedTokens: 1500,
      usedBridgedTokens: 500,
    };

    it("should calculate LP rewards weight correctly", () => {
      const config: StakingWeightConfig = { type: "LP_REWARDS" };
      const result = calculateStakingWeight(mockUser, config);
      expect(result).toBe(5000); // Sum of liquidity for full range positions
    });

    it("should calculate Minter rewards weight with bridge enabled", () => {
      const config: StakingWeightConfig = { 
        type: "MINTER_REWARDS",
        withBridge: true
      };
      const result = calculateStakingWeight(mockUser, config);
      
      // effectiveBridgedTokens = totalBridgedTokens - usedBridgedTokens = 1000
      // bridgedRatio = effectiveBridgedTokens / collateral = 1000 / 2000 = 0.5
      // rewardableDebt = min(debt, debt * bridgedRatio) = min(1000, 1000 * 0.5) = 500
      expect(result).toBe(500);
    });

    it("should calculate Minter rewards weight with bridge disabled", () => {
      const config: StakingWeightConfig = {
        type: "MINTER_REWARDS",
        withBridge: false
      };
      const result = calculateStakingWeight(mockUser, config);
      expect(result).toBe(1000); // Should return full debt amount
    });

    it("should handle zero values for Minter rewards with bridge", () => {
      const zeroUser: UserAccount = {
        ...mockUser,
        debt: 1000,
        collateral: 0,
        totalBridgedTokens: 0,
        usedBridgedTokens: 0,
      };
      const config: StakingWeightConfig = {
        type: "MINTER_REWARDS",
        withBridge: true
      };
      const result = calculateStakingWeight(zeroUser, config);
      expect(result).toBe(0);
    });

    it("should handle non-full-range positions for LP rewards", () => {
      const userWithMixedPositions: UserAccount = {
        ...mockUser,
        lpPositions: [
          { tokenId: 1, liquidity: 2000, lowerTick: -887220, upperTick: 887220 }, // full range
          { tokenId: 2, liquidity: 3000, lowerTick: -887220, upperTick: 887219 }, // not full range
          { tokenId: 3, liquidity: 4000, lowerTick: -887219, upperTick: 887220 }, // not full range
        ],
      };
      const config: StakingWeightConfig = { type: "LP_REWARDS" };
      const result = calculateStakingWeight(userWithMixedPositions, config);
      expect(result).toBe(2000); // Only counts the full range position
    });

    it("should throw error for unknown reward type", () => {
      const invalidConfig: StakingWeightConfig = {
        // @ts-expect-error Testing invalid type
        type: "UNKNOWN_TYPE"
      };
      
      expect(() => calculateStakingWeight(mockUser, invalidConfig))
        .toThrow("Unknown reward type: UNKNOWN_TYPE");
    });

    it("should handle edge case where bridged tokens exceed collateral", () => {
      const edgeUser: UserAccount = {
        ...mockUser,
        debt: 1000,
        collateral: 1000,
        totalBridgedTokens: 2000,
        usedBridgedTokens: 500,
      };
      const config: StakingWeightConfig = {
        type: "MINTER_REWARDS",
        withBridge: true
      };
      const result = calculateStakingWeight(edgeUser, config);
      expect(result).toBe(1000); // Should cap at debt amount
    });
  });
});
