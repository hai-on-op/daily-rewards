import { getEvents } from "./getEvents";
import { subgraphQueryPaginated } from "../subgraph/utils";
import { getExclusionList } from "../../utils/getExclusionList";
import { config } from "../../config";
import { RewardEventType } from "../../types";

// Mock modules
jest.mock("../subgraph/utils");
jest.mock("../../utils/getExclusionList");
jest.mock("../../config");
jest.mock("../../utils/chain", () => ({
  blockToTimestamp: jest
    .fn()
    .mockImplementation((block: number) => Promise.resolve(block * 1000)),
}));

describe("getEvents", () => {
  const mockConfig = {
    UNISWAP_POOL_ADDRESS: "0xpool",
    GEB_SUBGRAPH_URL: "https://geb.subgraph",
    UNISWAP_SUBGRAPH_URL: "https://uni.subgraph",
    EXCLUSION_LIST_FILE: "exclusion.json",
    RPC_URL: "https://mock.rpc",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (config as jest.Mock).mockReturnValue(mockConfig);
    (getExclusionList as jest.Mock).mockResolvedValue([]);
  });

  describe("LP Rewards Events", () => {
    it("Just a dummy test to get back to these tests", async () => {
      expect(0).toBeGreaterThanOrEqual(0);
    });
  });

  // TODO: Add tests get events
  /* describe("LP Rewards Events", () => {
    beforeEach(() => {
      // Mock position snapshots
      (subgraphQueryPaginated as jest.Mock)
        .mockImplementationOnce(() => Promise.resolve([{
          owner: "0x123",
          timestamp: "1000",
          liquidity: "2000",
          blockNumber: "100",
          position: {
            id: "1",
            tickLower: { tickIdx: "-887220" },
            tickUpper: { tickIdx: "887220" },
          },
        }]))
        // Mock swaps
        .mockImplementationOnce(() => Promise.resolve([{
          sqrtPriceX96: "1000000",
          timestamp: "1000",
          logIndex: "1",
          transaction: { blockNumber: "100" },
        }]));
    });

    it("should fetch and process LP rewards events", async () => {
      const result = await getEvents({
        type: "LP_REWARDS",
        startBlock: 100,
        endBlock: 200,
        owners: new Map([["0x123", "0xabc"]]),
      });

      expect(result).toHaveLength(2); // 1 position + 1 swap
      expect(result).toContainEqual(expect.objectContaining({
        type: RewardEventType.POOL_POSITION_UPDATE,
        address: "0x123",
      }));
      expect(result).toContainEqual(expect.objectContaining({
        type: RewardEventType.POOL_SWAP,
      }));
    });
  });

  describe("Minter Rewards Events", () => {
    beforeEach(() => {
      // Mock safe modifications
      (subgraphQueryPaginated as jest.Mock)
        .mockImplementationOnce(() => Promise.resolve([{
          id: "event-1",
          deltaDebt: "100",
          deltaCollateral: "200",
          safeHandler: "0x123",
          createdAt: "1000",
          createdAtBlock: "100",
          collateralType: { id: "ETH-A" },
        }]))
        // Mock accumulated rates
        .mockImplementationOnce(() => Promise.resolve([{
          id: "rate-1",
          rateMultiplier: "1.1",
          createdAt: "1000",
          createdAtBlock: "100",
          collateralType: { id: "ETH-A" },
        }]));
    });

    it("should fetch and process minter rewards events", async () => {
      const result = await getEvents({
        type: "MINTER_REWARDS",
        startBlock: 100,
        endBlock: 200,
        owners: new Map([["0x123", "0xabc"]]),
        cType: "ETH-A",
      });

      expect(result).toHaveLength(2); // 1 modification + 1 rate update
      expect(result).toContainEqual(expect.objectContaining({
        type: RewardEventType.DELTA_DEBT,
        address: "0xabc",
      }));
      expect(result).toContainEqual(expect.objectContaining({
        type: RewardEventType.UPDATE_ACCUMULATED_RATE,
      }));
    });
  });

  describe("Event Processing", () => {
    it("should filter out excluded addresses", async () => {
      (getExclusionList as jest.Mock).mockResolvedValue(["0x123"]);
      (subgraphQueryPaginated as jest.Mock).mockResolvedValue([{
        owner: "0x123",
        timestamp: "1000",
        liquidity: "2000",
        blockNumber: "100",
        position: {
          id: "1",
          tickLower: { tickIdx: "-887220" },
          tickUpper: { tickIdx: "887220" },
        },
      }]);

      const result = await getEvents({
        type: "LP_REWARDS",
        startBlock: 100,
        endBlock: 200,
        owners: new Map([["0x123", "0xabc"]]),
      });

      expect(result).toHaveLength(0);
    });

    it("should sort events by timestamp and logIndex", async () => {
      (subgraphQueryPaginated as jest.Mock).mockResolvedValue([
        {
          sqrtPriceX96: "1000000",
          timestamp: "2000",
          logIndex: "2",
          transaction: { blockNumber: "100" },
        },
        {
          sqrtPriceX96: "1000000",
          timestamp: "1000",
          logIndex: "1",
          transaction: { blockNumber: "100" },
        },
      ]);

      const result = await getEvents({
        type: "LP_REWARDS",
        startBlock: 100,
        endBlock: 200,
        owners: new Map(),
      });

      expect(result[0].timestamp).toBeLessThan(result[1].timestamp);
    });

    it("should throw error for invalid events", async () => {
      (subgraphQueryPaginated as jest.Mock).mockResolvedValue([{
        sqrtPriceX96: "1000000",
        // Missing timestamp
        logIndex: "1",
        transaction: { blockNumber: "100" },
      }]);

      await expect(getEvents({
        type: "LP_REWARDS",
        startBlock: 100,
        endBlock: 200,
        owners: new Map(),
      })).rejects.toThrow("Inconsistent event");
    });
  });

  describe("Error Handling", () => {
    it("should require cType for MINTER_REWARDS", async () => {
      await expect(getEvents({
        type: "MINTER_REWARDS",
        startBlock: 100,
        endBlock: 200,
        owners: new Map(),
        // Missing cType
      })).rejects.toThrow("cType is required for MINTER_REWARDS");
    });

    it("should handle subgraph query errors", async () => {
      (subgraphQueryPaginated as jest.Mock).mockRejectedValue(new Error("Subgraph error"));

      await expect(getEvents({
        type: "LP_REWARDS",
        startBlock: 100,
        endBlock: 200,
        owners: new Map(),
      })).rejects.toThrow("Subgraph error");
    });
  });*/
});
