import { MinterStrategy } from "./MinterStrategy";
import { MinterUserState } from "../types";

jest.mock("../../../config", () => ({
  config: jest.fn(() => ({
    MINTER_GEB_SUBGRAPH_URL: "http://test",
    MINTER_START_BLOCK: 100,
    MINTER_END_BLOCK: 200,
    COLLATERAL_TYPES: ["WETH"],
    EXCLUSION_LIST_FILE: "/tmp/exclusion.csv",
  })),
}));

jest.mock("../../../services/initial-data/getInitialState", () => ({
  getInitialState: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../../services/initial-data/getSafeOwnerMapping", () => ({
  getSafeOwnerMapping: jest.fn().mockResolvedValue(new Map()),
}));

jest.mock("../../../services/get-events/minterGetEvents", () => ({
  getEvents: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../../services/initial-data/getAccumulatedRate", () => ({
  getAccumulatedRate: jest.fn().mockResolvedValue(1.05),
}));

const mockProvider = {
  getBlock: jest.fn().mockImplementation((block: number) =>
    Promise.resolve({ timestamp: block * 2 })
  ),
} as any;

describe("MinterStrategy", () => {
  let strategy: MinterStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new MinterStrategy("WETH", mockProvider, "http://test");
  });

  describe("getWeight", () => {
    it("should return debt as weight", () => {
      expect(
        strategy.getWeight({
          address: "0x1",
          debt: 500,
          collateral: 100,
          totalBridgedTokens: 0,
        })
      ).toBe(500);
    });

    it("should return 0 for zero debt", () => {
      expect(
        strategy.getWeight({
          address: "0x1",
          debt: 0,
          collateral: 100,
          totalBridgedTokens: 0,
        })
      ).toBe(0);
    });
  });

  describe("createDefaultState", () => {
    it("should return zero state", () => {
      expect(strategy.createDefaultState("0xbob")).toEqual({
        address: "0xbob",
        debt: 0,
        collateral: 0,
        totalBridgedTokens: 0,
      });
    });
  });

  describe("applyEvent — DELTA_DEBT", () => {
    it("should adjust debt by accumulated rate", () => {
      const users = new Map<string, MinterUserState>([
        [
          "0xalice",
          { address: "0xalice", debt: 100, collateral: 50, totalBridgedTokens: 0 },
        ],
      ]);

      // Strategy needs accumulatedRate set — mock it by calling applyEvent
      // with a known rate. By default accumulatedRate=1 (before getInitialUsers)
      strategy.applyEvent(
        {
          eventType: "DELTA_DEBT",
          timestamp: 1000,
          address: "0xalice",
          deltaDebt: 10,
          complementaryValue: 5,
        },
        users
      );

      // Default accumulatedRate = 1, so adjustedDelta = 10 * 1 = 10
      expect(users.get("0xalice")?.debt).toBe(110);
      expect(users.get("0xalice")?.collateral).toBe(55);
    });

    it("should create new user if not exists", () => {
      const users = new Map<string, MinterUserState>();

      strategy.applyEvent(
        {
          eventType: "DELTA_DEBT",
          timestamp: 1000,
          address: "0xbob",
          deltaDebt: 50,
        },
        users
      );

      expect(users.has("0xbob")).toBe(true);
      expect(users.get("0xbob")?.debt).toBe(50);
    });

    it("should handle dusty negative debt", () => {
      const users = new Map<string, MinterUserState>([
        [
          "0xalice",
          { address: "0xalice", debt: 0.2, collateral: 0, totalBridgedTokens: 0 },
        ],
      ]);

      strategy.applyEvent(
        {
          eventType: "DELTA_DEBT",
          timestamp: 1000,
          address: "0xalice",
          deltaDebt: -0.3,
        },
        users
      );

      expect(users.get("0xalice")?.debt).toBe(0);
    });
  });

  describe("applyEvent — UPDATE_ACCUMULATED_RATE", () => {
    it("should multiply all users debt by (rateMultiplier + 1)", () => {
      const users = new Map<string, MinterUserState>([
        [
          "0xalice",
          { address: "0xalice", debt: 100, collateral: 0, totalBridgedTokens: 0 },
        ],
        [
          "0xbob",
          { address: "0xbob", debt: 200, collateral: 0, totalBridgedTokens: 0 },
        ],
      ]);

      strategy.applyEvent(
        {
          eventType: "UPDATE_ACCUMULATED_RATE",
          timestamp: 1000,
          rateMultiplier: 0.01, // 1% increase
        },
        users
      );

      expect(users.get("0xalice")?.debt).toBeCloseTo(101, 10);
      expect(users.get("0xbob")?.debt).toBeCloseTo(202, 10);
    });
  });

  describe("calculateBoosts", () => {
    it("should calculate debt-share-based boost", async () => {
      const users = new Map<string, MinterUserState>([
        [
          "0xalice",
          { address: "0xalice", debt: 300, collateral: 0, totalBridgedTokens: 0 },
        ],
        [
          "0xbob",
          { address: "0xbob", debt: 100, collateral: 0, totalBridgedTokens: 0 },
        ],
      ]);

      const boosts = await strategy.calculateBoosts(users, 1000);

      // Alice: min(300/400 + 1, 2) = min(1.75, 2) = 1.75
      expect(boosts.get("0xalice")).toBeCloseTo(1.75, 10);
      // Bob: min(100/400 + 1, 2) = min(1.25, 2) = 1.25
      expect(boosts.get("0xbob")).toBeCloseTo(1.25, 10);
    });

    it("should return 1 for users with zero debt", async () => {
      const users = new Map<string, MinterUserState>([
        [
          "0xalice",
          { address: "0xalice", debt: 0, collateral: 0, totalBridgedTokens: 0 },
        ],
      ]);

      const boosts = await strategy.calculateBoosts(users, 1000);
      expect(boosts.get("0xalice")).toBe(1);
    });

    it("should cache boosts by timestamp", async () => {
      const users = new Map<string, MinterUserState>([
        [
          "0xalice",
          { address: "0xalice", debt: 100, collateral: 0, totalBridgedTokens: 0 },
        ],
      ]);

      const boosts1 = await strategy.calculateBoosts(users, 1000);
      // Modify user debt — cached result should still return old value
      users.get("0xalice")!.debt = 999;
      const boosts2 = await strategy.calculateBoosts(users, 1000);

      expect(boosts1).toBe(boosts2); // Same object reference = cached
    });

    it("should recalculate when timestamp changes", async () => {
      const users = new Map<string, MinterUserState>([
        [
          "0xalice",
          { address: "0xalice", debt: 100, collateral: 0, totalBridgedTokens: 0 },
        ],
      ]);

      const boosts1 = await strategy.calculateBoosts(users, 1000);
      users.get("0xalice")!.debt = 999;
      const boosts2 = await strategy.calculateBoosts(users, 2000);

      expect(boosts1).not.toBe(boosts2); // Different timestamp = recalculated
    });
  });
});
