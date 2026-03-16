import { LpStakingStrategy } from "./LpStakingStrategy";

jest.mock("../../../services/lp-staking-data/getInitialLpStakingState", () => ({
  getInitialLpStakingState: jest.fn(),
  getLpStakingEventsInRange: jest.fn(),
}));

jest.mock("../../../services/skite-data", () => ({
  getStakingPositions: jest.fn().mockResolvedValue([]),
  calculateStakingAtTimestamp: jest.fn().mockReturnValue({ users: {} }),
}));

// Mock provider
const mockProvider = {
  getBlock: jest.fn().mockImplementation((block: number) =>
    Promise.resolve({ timestamp: block * 2 }) // simple block→timestamp mapping
  ),
} as any;

import {
  getInitialLpStakingState,
  getLpStakingEventsInRange,
} from "../../../services/lp-staking-data/getInitialLpStakingState";

const mockGetInitial = getInitialLpStakingState as jest.Mock;
const mockGetEvents = getLpStakingEventsInRange as jest.Mock;

describe("LpStakingStrategy", () => {
  let strategy: LpStakingStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new LpStakingStrategy("HAI_BOLD_CURVE", mockProvider);
  });

  describe("getInitialUsers", () => {
    it("should fetch initial state and convert to Map", async () => {
      mockGetInitial.mockResolvedValue({
        "0xalice": {
          address: "0xalice",
          collateral: 500,
          stakingWeight: 500,
          debt: 0,
          lpPositions: [],
          rewardPerWeightStored: 0,
          earned: 0,
          totalBridgedTokens: 0,
          usedBridgedTokens: 0,
        },
      });

      const users = await strategy.getInitialUsers({
        startBlock: 100,
        endBlock: 200,
      });

      expect(mockGetInitial).toHaveBeenCalledWith("HAI_BOLD_CURVE", 200); // block * 2
      expect(users.size).toBe(1);
      expect(users.get("0xalice")?.lpStaked).toBe(500);
    });
  });

  describe("getEvents", () => {
    it("should fetch and map STAKE/WITHDRAW events", async () => {
      mockGetEvents.mockResolvedValue([
        {
          id: "1",
          user: { id: "0xAlice" },
          amount: "1000000000000000000", // 1e18 = 1 token
          timestamp: "300",
          transactionHash: "0x1",
          type: "STAKE",
        },
        {
          id: "2",
          user: { id: "0xAlice" },
          amount: "500000000000000000", // 0.5 token
          timestamp: "400",
          transactionHash: "0x2",
          type: "WITHDRAW",
        },
      ]);

      const events = await strategy.getEvents({
        startBlock: 100,
        endBlock: 200,
      });

      expect(events).toHaveLength(2);
      expect(events[0].address).toBe("0xalice");
      expect(events[0].deltaAmount).toBeCloseTo(1, 10);
      expect(events[0].timestamp).toBe(300);
      expect(events[1].deltaAmount).toBeCloseTo(-0.5, 10);
    });
  });

  describe("getWeight", () => {
    it("should return lpStaked as weight", () => {
      expect(strategy.getWeight({ address: "0x1", lpStaked: 250 })).toBe(250);
    });
  });

  describe("createDefaultState", () => {
    it("should return zero state", () => {
      const state = strategy.createDefaultState("0xbob");
      expect(state).toEqual({ address: "0xbob", lpStaked: 0 });
    });
  });

  describe("applyEvent", () => {
    it("should increase lpStaked for STAKE", () => {
      const users = new Map([
        ["0xalice", { address: "0xalice", lpStaked: 100 }],
      ]);

      strategy.applyEvent(
        { timestamp: 1000, address: "0xalice", deltaAmount: 50 },
        users
      );

      expect(users.get("0xalice")?.lpStaked).toBe(150);
    });

    it("should decrease lpStaked for WITHDRAW", () => {
      const users = new Map([
        ["0xalice", { address: "0xalice", lpStaked: 100 }],
      ]);

      strategy.applyEvent(
        { timestamp: 1000, address: "0xalice", deltaAmount: -30 },
        users
      );

      expect(users.get("0xalice")?.lpStaked).toBe(70);
    });

    it("should create new user if not exists", () => {
      const users = new Map<string, any>();

      strategy.applyEvent(
        { timestamp: 1000, address: "0xbob", deltaAmount: 200 },
        users
      );

      expect(users.get("0xbob")?.lpStaked).toBe(200);
    });

    it("should handle dusty negative with 0.0001 threshold", () => {
      const users = new Map([
        ["0xalice", { address: "0xalice", lpStaked: 0.00005 }],
      ]);

      strategy.applyEvent(
        { timestamp: 1000, address: "0xalice", deltaAmount: -0.00005 },
        users
      );

      // Result would be ~0 or tiny negative due to float, dusty threshold handles it
      // Let's test explicit dusty case
      users.get("0xalice")!.lpStaked = 0.1;
      strategy.applyEvent(
        { timestamp: 1000, address: "0xalice", deltaAmount: -0.10005 },
        users
      );

      expect(users.get("0xalice")?.lpStaked).toBe(0);
    });
  });

  describe("calculateBoosts", () => {
    it("should return empty map when no staking positions", async () => {
      const users = new Map([
        ["0xalice", { address: "0xalice", lpStaked: 100 }],
      ]);

      const boosts = await strategy.calculateBoosts(users, 1000);
      expect(boosts.size).toBe(0);
    });
  });
});
