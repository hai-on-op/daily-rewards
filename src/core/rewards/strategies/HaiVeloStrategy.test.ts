import { HaiVeloStrategy } from "./HaiVeloStrategy";
import { HaiVeloUserState, HaiVeloEvent } from "../types";

jest.mock("../../../config", () => ({
  config: jest.fn(() => ({
    HAIVELO_COLLATERAL_ENABLED: true,
    HAIVELO_LP_STAKING_ENABLED: false,
    HAIVELO_VELO_LP_INDEXER: null,
    HAIVELO_SUBGRAPH_URL: "http://test",
  })),
}));

jest.mock("../../../services/initial-data/getInitialHaiveloState", () => ({
  getRawHaiveloCollateralData: jest.fn().mockResolvedValue([]),
  processHaiveloCollateral: jest.fn().mockReturnValue({}),
}));

jest.mock("../../../services/lp-staking-data", () => ({
  getLpStakingPositions: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../../services/haivelo-lp-data", () => ({
  loadSyncEventsCache: jest.fn().mockResolvedValue([]),
  clearSyncEventsCache: jest.fn(),
  getClosestSyncEventFromCache: jest.fn().mockReturnValue(null),
  calculateHaiVeloPerLp: jest.fn().mockReturnValue(0.5),
  getPoolState: jest.fn().mockResolvedValue(null),
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

describe("HaiVeloStrategy", () => {
  let strategy: HaiVeloStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new HaiVeloStrategy(mockProvider);
  });

  describe("getWeight", () => {
    it("should return collateral when no LP staking", () => {
      // currentHaiVeloPerLp defaults to 0
      const state: HaiVeloUserState = {
        address: "0x1",
        collateral: 100,
        lpStakedRaw: 50,
      };
      // weight = 100 + 50 * 0 = 100
      expect(strategy.getWeight(state)).toBe(100);
    });

    it("should include LP component after price update", () => {
      const users = new Map<string, HaiVeloUserState>();
      // Simulate a price update event
      strategy.applyEvent(
        { eventType: "PRICE_UPDATE", timestamp: 1000, haiVeloPerLp: 2.0 },
        users
      );

      const state: HaiVeloUserState = {
        address: "0x1",
        collateral: 100,
        lpStakedRaw: 50,
      };
      // weight = 100 + 50 * 2.0 = 200
      expect(strategy.getWeight(state)).toBe(200);
    });
  });

  describe("createDefaultState", () => {
    it("should return zero state", () => {
      expect(strategy.createDefaultState("0xbob")).toEqual({
        address: "0xbob",
        collateral: 0,
        lpStakedRaw: 0,
      });
    });
  });

  describe("applyEvent", () => {
    it("should handle COLLATERAL events", () => {
      const users = new Map<string, HaiVeloUserState>([
        ["0xalice", { address: "0xalice", collateral: 100, lpStakedRaw: 0 }],
      ]);

      strategy.applyEvent(
        {
          eventType: "COLLATERAL",
          timestamp: 1000,
          address: "0xalice",
          deltaCollateral: 50,
        },
        users
      );

      expect(users.get("0xalice")?.collateral).toBe(150);
    });

    it("should handle LP_STAKING events", () => {
      const users = new Map<string, HaiVeloUserState>([
        ["0xalice", { address: "0xalice", collateral: 0, lpStakedRaw: 10 }],
      ]);

      strategy.applyEvent(
        {
          eventType: "LP_STAKING",
          timestamp: 1000,
          address: "0xalice",
          deltaLpAmount: 5,
        },
        users
      );

      expect(users.get("0xalice")?.lpStakedRaw).toBe(15);
    });

    it("should handle PRICE_UPDATE events", () => {
      const users = new Map<string, HaiVeloUserState>([
        ["0xalice", { address: "0xalice", collateral: 100, lpStakedRaw: 50 }],
      ]);

      strategy.applyEvent(
        {
          eventType: "PRICE_UPDATE",
          timestamp: 1000,
          haiVeloPerLp: 3.0,
        },
        users
      );

      // User state unchanged, but weight should now use new ratio
      expect(users.get("0xalice")?.collateral).toBe(100);
      expect(users.get("0xalice")?.lpStakedRaw).toBe(50);
      // weight = 100 + 50 * 3.0 = 250
      expect(strategy.getWeight(users.get("0xalice")!)).toBe(250);
    });

    it("should create new user for COLLATERAL event if not exists", () => {
      const users = new Map<string, HaiVeloUserState>();

      strategy.applyEvent(
        {
          eventType: "COLLATERAL",
          timestamp: 1000,
          address: "0xbob",
          deltaCollateral: 200,
        },
        users
      );

      expect(users.has("0xbob")).toBe(true);
      expect(users.get("0xbob")?.collateral).toBe(200);
      expect(users.get("0xbob")?.lpStakedRaw).toBe(0);
    });

    it("should create new user for LP_STAKING event if not exists", () => {
      const users = new Map<string, HaiVeloUserState>();

      strategy.applyEvent(
        {
          eventType: "LP_STAKING",
          timestamp: 1000,
          address: "0xbob",
          deltaLpAmount: 30,
        },
        users
      );

      expect(users.get("0xbob")?.lpStakedRaw).toBe(30);
      expect(users.get("0xbob")?.collateral).toBe(0);
    });

    it("should handle dusty collateral (-0.4 threshold)", () => {
      const users = new Map<string, HaiVeloUserState>([
        ["0xalice", { address: "0xalice", collateral: 0.2, lpStakedRaw: 0 }],
      ]);

      strategy.applyEvent(
        {
          eventType: "COLLATERAL",
          timestamp: 1000,
          address: "0xalice",
          deltaCollateral: -0.3,
        },
        users
      );

      expect(users.get("0xalice")?.collateral).toBe(0);
    });

    it("should handle dusty LP staking (-0.0001 threshold)", () => {
      const users = new Map<string, HaiVeloUserState>([
        ["0xalice", { address: "0xalice", collateral: 0, lpStakedRaw: 0.00005 }],
      ]);

      strategy.applyEvent(
        {
          eventType: "LP_STAKING",
          timestamp: 1000,
          address: "0xalice",
          deltaLpAmount: -0.00006,
        },
        users
      );

      expect(users.get("0xalice")?.lpStakedRaw).toBe(0);
    });
  });

  describe("calculateBoosts", () => {
    it("should return empty map when no staking positions", async () => {
      const users = new Map<string, HaiVeloUserState>([
        ["0xalice", { address: "0xalice", collateral: 100, lpStakedRaw: 0 }],
      ]);

      const boosts = await strategy.calculateBoosts(users, 1000);
      expect(boosts.size).toBe(0);
    });
  });
});
