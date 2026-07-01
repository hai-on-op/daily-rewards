import { LpStrategy } from "./LpStrategy";
import { LpUserState, LpPosition } from "../types";
import { calculateStakingAtTimestamp } from "../../../services/skite-data";

jest.mock("../../../config", () => ({
  config: jest.fn(() => ({
    LP_START_BLOCK: 100,
    LP_END_BLOCK: 200,
    LP_GEB_SUBGRAPH_URL: "http://test",
    LP_COLLATERAL_TYPES: ["OP", "WETH"],
    UNISWAP_POOL_ADDRESS: "0xpool",
    UNISWAP_SUBGRAPH_URL: "http://uniswap",
    EXCLUSION_LIST_FILE: "/tmp/exclusion.csv",
  })),
}));

jest.mock("../../../services/initial-data/getInitialState", () => ({
  getInitialState: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../../services/initial-data/getSafeOwnerMapping", () => ({
  getSafeOwnerMapping: jest.fn().mockResolvedValue(new Map()),
}));

jest.mock("../../../services/get-events/lpGetEvents", () => ({
  getEvents: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../../services/initial-data/getAccumulatedRate", () => ({
  getAccumulatedRate: jest.fn().mockResolvedValue(1),
}));

jest.mock("../../../services/staking-weights/getStakingWeight", () => ({
  getStakingWeightForLPPositions: jest.fn().mockImplementation(
    (positions: any[]) => {
      // Only full-range positions count
      return positions
        .filter((p) => p.lowerTick === -887220 && p.upperTick === 887220)
        .reduce((acc, p) => acc + p.liquidity, 0);
    }
  ),
}));

jest.mock("../../../services/pool-state/getPoolState", () => ({
  getPoolState: jest.fn().mockResolvedValue({ sqrtPrice: "1000000" }),
}));

jest.mock("../../../services/skite-data", () => ({
  getStakingPositions: jest.fn().mockResolvedValue([]),
  calculateStakingAtTimestamp: jest.fn().mockReturnValue({ users: {} }),
}));

const mockProvider = {
  getBlock: jest.fn().mockImplementation((block: number) =>
    Promise.resolve({ timestamp: block * 2 })
  ),
} as any;
const mockCalculateStakingAtTimestamp = calculateStakingAtTimestamp as jest.Mock;

describe("LpStrategy", () => {
  let strategy: LpStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCalculateStakingAtTimestamp.mockReturnValue({ users: {} });
    strategy = new LpStrategy(mockProvider, "http://test");
  });

  describe("getWeight", () => {
    it("should return sum of full-range position liquidity", () => {
      const state: LpUserState = {
        address: "0x1",
        debt: 100,
        lpPositions: [
          { tokenId: 1, lowerTick: -887220, upperTick: 887220, liquidity: 500 },
          { tokenId: 2, lowerTick: -887220, upperTick: 887220, liquidity: 300 },
        ],
      };
      expect(strategy.getWeight(state)).toBe(800);
    });

    it("should exclude non-full-range positions", () => {
      const state: LpUserState = {
        address: "0x1",
        debt: 100,
        lpPositions: [
          { tokenId: 1, lowerTick: -887220, upperTick: 887220, liquidity: 500 },
          { tokenId: 2, lowerTick: -100, upperTick: 100, liquidity: 300 },
        ],
      };
      expect(strategy.getWeight(state)).toBe(500);
    });

    it("should return 0 for no positions", () => {
      expect(strategy.getWeight({ address: "0x1", debt: 0, lpPositions: [] })).toBe(0);
    });
  });

  describe("createDefaultState", () => {
    it("should return zero state with empty positions", () => {
      expect(strategy.createDefaultState("0xbob")).toEqual({
        address: "0xbob",
        debt: 0,
        lpPositions: [],
      });
    });
  });

  describe("shouldCreditAllUsers", () => {
    it("should return false for DELTA_DEBT", () => {
      expect(
        strategy.shouldCreditAllUsers({ eventType: "DELTA_DEBT", timestamp: 0 })
      ).toBe(false);
    });

    it("should return false for POOL_POSITION_UPDATE", () => {
      expect(
        strategy.shouldCreditAllUsers({
          eventType: "POOL_POSITION_UPDATE",
          timestamp: 0,
        })
      ).toBe(false);
    });

    it("should return true for POOL_SWAP", () => {
      expect(
        strategy.shouldCreditAllUsers({ eventType: "POOL_SWAP", timestamp: 0 })
      ).toBe(true);
    });

    it("should return true for UPDATE_ACCUMULATED_RATE", () => {
      expect(
        strategy.shouldCreditAllUsers({
          eventType: "UPDATE_ACCUMULATED_RATE",
          timestamp: 0,
        })
      ).toBe(true);
    });
  });

  describe("applyEvent — DELTA_DEBT", () => {
    it("should adjust debt", () => {
      const users = new Map<string, LpUserState>([
        ["0xalice", { address: "0xalice", debt: 100, lpPositions: [] }],
      ]);

      strategy.applyEvent(
        {
          eventType: "DELTA_DEBT",
          timestamp: 1000,
          address: "0xalice",
          deltaDebt: 50,
          cType: "WETH",
        },
        users
      );

      // Default rate = 1 (before getInitialUsers), so adjusted = 50 * 1 = 50
      expect(users.get("0xalice")?.debt).toBe(150);
    });

    it("should handle dusty negative debt", () => {
      const users = new Map<string, LpUserState>([
        ["0xalice", { address: "0xalice", debt: 0.2, lpPositions: [] }],
      ]);

      strategy.applyEvent(
        {
          eventType: "DELTA_DEBT",
          timestamp: 1000,
          address: "0xalice",
          deltaDebt: -0.3,
          cType: "WETH",
        },
        users
      );

      expect(users.get("0xalice")?.debt).toBe(0);
    });
  });

  describe("applyEvent — POOL_POSITION_UPDATE", () => {
    it("should add new position", () => {
      const users = new Map<string, LpUserState>([
        ["0xalice", { address: "0xalice", debt: 0, lpPositions: [] }],
      ]);

      strategy.applyEvent(
        {
          eventType: "POOL_POSITION_UPDATE",
          timestamp: 1000,
          address: "0xalice",
          position: {
            tokenId: 1,
            lowerTick: -887220,
            upperTick: 887220,
            liquidity: 500,
          },
        },
        users
      );

      expect(users.get("0xalice")?.lpPositions).toHaveLength(1);
      expect(users.get("0xalice")?.lpPositions[0].liquidity).toBe(500);
    });

    it("should update existing position liquidity", () => {
      const users = new Map<string, LpUserState>([
        [
          "0xalice",
          {
            address: "0xalice",
            debt: 0,
            lpPositions: [
              { tokenId: 1, lowerTick: -887220, upperTick: 887220, liquidity: 500 },
            ],
          },
        ],
      ]);

      strategy.applyEvent(
        {
          eventType: "POOL_POSITION_UPDATE",
          timestamp: 1000,
          address: "0xalice",
          position: {
            tokenId: 1,
            lowerTick: -887220,
            upperTick: 887220,
            liquidity: 800,
          },
        },
        users
      );

      expect(users.get("0xalice")?.lpPositions[0].liquidity).toBe(800);
    });

    it("should handle NFT transfer (remove from previous owner)", () => {
      const users = new Map<string, LpUserState>([
        [
          "0xalice",
          {
            address: "0xalice",
            debt: 0,
            lpPositions: [
              { tokenId: 1, lowerTick: -887220, upperTick: 887220, liquidity: 500 },
            ],
          },
        ],
        ["0xbob", { address: "0xbob", debt: 0, lpPositions: [] }],
      ]);

      // tokenId 1 moves from alice to bob
      strategy.applyEvent(
        {
          eventType: "POOL_POSITION_UPDATE",
          timestamp: 1000,
          address: "0xbob",
          position: {
            tokenId: 1,
            lowerTick: -887220,
            upperTick: 887220,
            liquidity: 500,
          },
        },
        users
      );

      expect(users.get("0xalice")?.lpPositions).toHaveLength(0);
      expect(users.get("0xbob")?.lpPositions).toHaveLength(1);
    });
  });

  describe("applyEvent — UPDATE_ACCUMULATED_RATE", () => {
    it("should multiply all users debt", () => {
      const users = new Map<string, LpUserState>([
        ["0xalice", { address: "0xalice", debt: 100, lpPositions: [] }],
        ["0xbob", { address: "0xbob", debt: 200, lpPositions: [] }],
      ]);

      strategy.applyEvent(
        {
          eventType: "UPDATE_ACCUMULATED_RATE",
          timestamp: 1000,
          rateMultiplier: 0.01,
          cType: "WETH",
        },
        users
      );

      expect(users.get("0xalice")?.debt).toBeCloseTo(101, 10);
      expect(users.get("0xbob")?.debt).toBeCloseTo(202, 10);
    });
  });

  describe("calculateBoosts", () => {
    it("should return empty map with no staking positions", async () => {
      const users = new Map<string, LpUserState>([
        ["0xalice", { address: "0xalice", debt: 0, lpPositions: [] }],
      ]);

      const boosts = await strategy.calculateBoosts(users, 1000);
      expect(boosts.size).toBe(0);
    });

    it("should cache boosts by timestamp", async () => {
      const users = new Map<string, LpUserState>();
      const boosts1 = await strategy.calculateBoosts(users, 1000);
      const boosts2 = await strategy.calculateBoosts(users, 1000);
      expect(boosts1).toBe(boosts2);
    });

    it("should calculate current LP boost with all LP liquidity as denominator", async () => {
      mockCalculateStakingAtTimestamp.mockReturnValue({
        users: {
          "0xalice": { share: 0.05 },
          "0xbob": { share: 0.95 },
        },
      });

      const users = new Map<string, LpUserState>([
        [
          "0xalice",
          {
            address: "0xalice",
            debt: 0,
            lpPositions: [
              { tokenId: 1, lowerTick: -887220, upperTick: 887220, liquidity: 100 },
            ],
          },
        ],
        [
          "0xbob",
          {
            address: "0xbob",
            debt: 0,
            lpPositions: [
              { tokenId: 2, lowerTick: -887220, upperTick: 887220, liquidity: 100 },
              { tokenId: 3, lowerTick: -100, upperTick: 100, liquidity: 900 },
            ],
          },
        ],
      ]);

      const boosts = await strategy.calculateBoosts(users, 1000);

      expect(boosts.get("0xalice")).toBeCloseTo(1.55, 10);
      expect(boosts.get("0xbob")).toBe(2);
    });
  });
});
