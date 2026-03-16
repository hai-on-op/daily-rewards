import { HaiAeroStrategy } from "./HaiAeroStrategy";

// Mock the external services
jest.mock("../../../services/initial-data/getInitialHaiaeroState", () => ({
  getRawHaiaeroCollateralData: jest.fn(),
  processHaiaeroCollateral: jest.fn(),
}));

jest.mock("../../../services/skite-data", () => ({
  getStakingPositions: jest.fn().mockResolvedValue([]),
  calculateStakingAtTimestamp: jest.fn().mockReturnValue({ users: {} }),
}));

import {
  getRawHaiaeroCollateralData,
  processHaiaeroCollateral,
} from "../../../services/initial-data/getInitialHaiaeroState";

const mockGetRaw = getRawHaiaeroCollateralData as jest.Mock;
const mockProcess = processHaiaeroCollateral as jest.Mock;

const makeEvent = (
  address: string,
  delta: number,
  block: number,
  timestamp: number
) => ({
  id: `evt-${block}`,
  createdAt: String(timestamp),
  deltaCollateral: String(delta),
  deltaDebt: "0",
  safe: { id: "safe1", owner: { id: address, address } },
  collateralType: { id: "HAIAERO" },
  createdAtTransaction: "0xtx",
  createdAtBlock: String(block),
});

describe("HaiAeroStrategy", () => {
  let strategy: HaiAeroStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new HaiAeroStrategy();
  });

  describe("getInitialUsers", () => {
    it("should filter events before startBlock and return user map", async () => {
      const events = [
        makeEvent("0xalice", 100, 50, 50000),
        makeEvent("0xbob", 200, 80, 80000),
        makeEvent("0xcharlie", 300, 120, 120000), // after startBlock
      ];

      mockGetRaw.mockResolvedValue(events);
      mockProcess.mockReturnValue({
        "0xalice": {
          address: "0xalice",
          collateral: 100,
          stakingWeight: 100,
          debt: 0,
          lpPositions: [],
          rewardPerWeightStored: 0,
          earned: 0,
          totalBridgedTokens: 0,
          usedBridgedTokens: 0,
        },
        "0xbob": {
          address: "0xbob",
          collateral: 200,
          stakingWeight: 200,
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

      // processHaiaeroCollateral called with only events before block 100
      expect(mockProcess).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ createdAtBlock: "50" }),
          expect.objectContaining({ createdAtBlock: "80" }),
        ])
      );
      expect(mockProcess.mock.calls[0][0]).toHaveLength(2);

      expect(users.size).toBe(2);
      expect(users.get("0xalice")?.collateral).toBe(100);
      expect(users.get("0xbob")?.collateral).toBe(200);
    });
  });

  describe("getEvents", () => {
    it("should filter and map events within block range", async () => {
      const events = [
        makeEvent("0xalice", 50, 80, 80000),  // before range
        makeEvent("0xbob", 100, 120, 120000),  // in range
        makeEvent("0xalice", 75, 150, 150000), // in range
        makeEvent("0xcharlie", 200, 250, 250000), // after range
      ];

      mockGetRaw.mockResolvedValue(events);

      const result = await strategy.getEvents({
        startBlock: 100,
        endBlock: 200,
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        timestamp: 120000,
        address: "0xbob",
        deltaCollateral: 100,
      });
      expect(result[1]).toEqual({
        timestamp: 150000,
        address: "0xalice",
        deltaCollateral: 75,
      });
    });
  });

  describe("getWeight", () => {
    it("should return collateral as weight", () => {
      expect(strategy.getWeight({ address: "0x1", collateral: 500 })).toBe(500);
    });

    it("should return 0 for zero collateral", () => {
      expect(strategy.getWeight({ address: "0x1", collateral: 0 })).toBe(0);
    });
  });

  describe("applyEvent", () => {
    it("should increase existing user collateral", () => {
      const users = new Map([
        ["0xalice", { address: "0xalice", collateral: 100 }],
      ]);

      strategy.applyEvent(
        { timestamp: 1000, address: "0xalice", deltaCollateral: 50 },
        users
      );

      expect(users.get("0xalice")?.collateral).toBe(150);
    });

    it("should create new user if not exists", () => {
      const users = new Map();

      strategy.applyEvent(
        { timestamp: 1000, address: "0xbob", deltaCollateral: 200 },
        users
      );

      expect(users.has("0xbob")).toBe(true);
      expect(users.get("0xbob")?.collateral).toBe(200);
    });

    it("should handle dusty negative collateral", () => {
      const users = new Map([
        ["0xalice", { address: "0xalice", collateral: 0.1 }],
      ]);

      strategy.applyEvent(
        { timestamp: 1000, address: "0xalice", deltaCollateral: -0.1 },
        users
      );

      // -0.0 would be in the dusty range (< 0 && > -0.4), should be set to 0
      // Actually 0.1 - 0.1 = 0, but let's test with a value that goes slightly negative
      users.get("0xalice")!.collateral = 0.2;
      strategy.applyEvent(
        { timestamp: 1000, address: "0xalice", deltaCollateral: -0.3 },
        users
      );

      expect(users.get("0xalice")?.collateral).toBe(0);
    });

    it("should NOT zero out large negative collateral", () => {
      const users = new Map([
        ["0xalice", { address: "0xalice", collateral: 1 }],
      ]);

      strategy.applyEvent(
        { timestamp: 1000, address: "0xalice", deltaCollateral: -2 },
        users
      );

      expect(users.get("0xalice")?.collateral).toBe(-1);
    });
  });

  describe("calculateBoosts", () => {
    it("should return empty map when no staking positions", async () => {
      const users = new Map([
        ["0xalice", { address: "0xalice", collateral: 100 }],
      ]);

      const boosts = await strategy.calculateBoosts(users, 1000);

      expect(boosts.size).toBe(0);
    });
  });
});
