import {
  getSafeModificationEvents,
  getPoolPositionUpdate,
  getPoolSwap,
  getUpdateAccumulatedRateEvent,
} from "./lpGetEvents";
import { subgraphQueryPaginated } from "../subgraph/utils";
import { config } from "../../config";
import { RewardEventType } from "../../types";
import { blockToTimestamp } from "../../utils/chain";
import { getExclusionList } from "../../utils/getExclusionList";
import { getEvents } from "./lpGetEvents";

// Add mock for getExclusionList
jest.mock("../../utils/getExclusionList", () => ({
  getExclusionList: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../utils/chain", () => ({
  blockToTimestamp: jest
    .fn()
    .mockImplementation((block: number) => Promise.resolve(block * 1000)),
}));

jest.mock("../subgraph/utils");
jest.mock("../../config", () => ({
  config: jest.fn().mockReturnValue({
    GEB_SUBGRAPH_URL: "https://geb.subgraph",
    UNISWAP_POOL_ADDRESS: "0xpool",
    UNISWAP_SUBGRAPH_URL: "https://uni.subgraph",
    EXCLUSION_LIST_FILE: "exclusion.json",
  }),
}));

describe("getSafeModificationEvents", () => {
  const mockOwnerMapping = new Map([
    ["0xsafe1", "0xowner1"],
    ["0xsafe2", "0xowner2"],
  ]);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch and process safe modifications", async () => {
    const mockModifications = [
      {
        id: "event-1",
        deltaDebt: "100",
        safeHandler: "0xsafe1",
        createdAt: "1000",
        collateralType: { id: "ETH-A" },
      },
    ];

    (subgraphQueryPaginated as jest.Mock)
      .mockResolvedValueOnce(mockModifications) // modifySAFECollateralizations
      .mockResolvedValueOnce([]) // confiscateSAFECollateralAndDebts
      .mockResolvedValueOnce([]); // transferSAFECollateralAndDebts

    const events = await getSafeModificationEvents(100, 200, mockOwnerMapping);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: RewardEventType.DELTA_DEBT,
      value: 100,
      address: "0xowner1",
      logIndex: expect.any(Number),
      timestamp: 1000,
      cType: "ETH-A",
    });
  });

  it("should handle confiscated safes", async () => {
    const mockConfiscations = [
      {
        id: "event-2",
        deltaDebt: "200",
        safeHandler: "0xsafe2",
        createdAt: "1100",
        collateralType: { id: "ETH-A" },
      },
    ];

    (subgraphQueryPaginated as jest.Mock)
      .mockResolvedValueOnce([]) // modifySAFECollateralizations
      .mockResolvedValueOnce(mockConfiscations) // confiscateSAFECollateralAndDebts
      .mockResolvedValueOnce([]); // transferSAFECollateralAndDebts

    const events = await getSafeModificationEvents(100, 200, mockOwnerMapping);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: RewardEventType.DELTA_DEBT,
      value: 200,
      address: "0xowner2",
      logIndex: expect.any(Number),
      timestamp: 1100,
      cType: "ETH-A",
    });
  });

  it("should process safe transfers correctly", async () => {
    const mockTransfers = [
      {
        id: "event-3",
        deltaDebt: "300",
        createdAt: "1200",
        srcHandler: "0xsafe1",
        dstHandler: "0xsafe2",
      },
    ];

    (subgraphQueryPaginated as jest.Mock)
      .mockResolvedValueOnce([]) // modifySAFECollateralizations
      .mockResolvedValueOnce([]) // confiscateSAFECollateralAndDebts
      .mockResolvedValueOnce(mockTransfers); // transferSAFECollateralAndDebts

    const events = await getSafeModificationEvents(100, 200, mockOwnerMapping);

    expect(events).toHaveLength(2);
    expect(events).toContainEqual({
      type: RewardEventType.DELTA_DEBT,
      value: 300,
      address: "0xowner2", // destination owner
      logIndex: expect.any(Number),
      timestamp: 1200,
      cType: undefined,
    });
    expect(events).toContainEqual({
      type: RewardEventType.DELTA_DEBT,
      value: -300,
      address: "0xowner1", // source owner
      logIndex: expect.any(Number),
      timestamp: 1200,
      cType: undefined,
    });
  });

  it("should skip events with unknown safe handlers", async () => {
    const mockModifications = [
      {
        id: "event-4",
        deltaDebt: "400",
        safeHandler: "0xunknown",
        createdAt: "1300",
        collateralType: { id: "ETH-A" },
      },
    ];

    (subgraphQueryPaginated as jest.Mock)
      .mockResolvedValueOnce(mockModifications)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const events = await getSafeModificationEvents(100, 200, mockOwnerMapping);

    expect(events).toHaveLength(0);
  });

  it("should handle multiple event types together", async () => {
    const mockModifications = [
      {
        id: "event-5",
        deltaDebt: "500",
        safeHandler: "0xsafe1",
        createdAt: "1400",
        collateralType: { id: "ETH-A" },
      },
    ];

    const mockConfiscations = [
      {
        id: "event-6",
        deltaDebt: "600",
        safeHandler: "0xsafe2",
        createdAt: "1500",
        collateralType: { id: "ETH-A" },
      },
    ];

    (subgraphQueryPaginated as jest.Mock)
      .mockResolvedValueOnce(mockModifications)
      .mockResolvedValueOnce(mockConfiscations)
      .mockResolvedValueOnce([]);

    const events = await getSafeModificationEvents(100, 200, mockOwnerMapping);

    expect(events).toHaveLength(2);
    expect(events.map((e) => e.value)).toEqual([500, 600]);
  });

  it("should use correct query parameters", async () => {
    (subgraphQueryPaginated as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await getSafeModificationEvents(100, 200, mockOwnerMapping);

    expect(subgraphQueryPaginated).toHaveBeenCalledWith(
      expect.stringContaining("createdAtBlock_gte: 100"),
      "modifySAFECollateralizations",
      "https://geb.subgraph"
    );
  });
});

describe("getPoolPositionUpdate", () => {
  // Mock cache object

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch and process position snapshots", async () => {
    const mockSnapshots = [
      {
        owner: "0xowner1",
        timestamp: "1000",
        liquidity: "1000000",
        position: {
          id: "1",
          tickLower: { tickIdx: "-887220" },
          tickUpper: { tickIdx: "887220" },
        },
      },
      {
        owner: "0xowner2",
        timestamp: "2000",
        liquidity: "2000000",
        position: {
          id: "2",
          tickLower: { tickIdx: "-887220" },
          tickUpper: { tickIdx: "887220" },
        },
      },
    ];

    (subgraphQueryPaginated as jest.Mock).mockResolvedValue(mockSnapshots);

    const result = await getPoolPositionUpdate(100, 200);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: RewardEventType.POOL_POSITION_UPDATE,
      value: {
        tokenId: 1,
        upperTick: 887220,
        lowerTick: -887220,
        liquidity: 1000000,
      },
      address: "0xowner1",
      logIndex: 1e6,
      timestamp: 1000,
    });
  });

  it("should handle empty response", async () => {
    (subgraphQueryPaginated as jest.Mock).mockResolvedValue([]);

    const result = await getPoolPositionUpdate(100, 200);

    expect(result).toHaveLength(0);
  });
});

describe("getPoolSwap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch and process swap events", async () => {
    (blockToTimestamp as jest.Mock)
      .mockResolvedValueOnce(100000) // for start block
      .mockResolvedValueOnce(200000); // for end block

    const mockSwaps = [
      {
        sqrtPriceX96: "1000000",
        timestamp: "1000",
        logIndex: "1",
      },
      {
        sqrtPriceX96: "2000000",
        timestamp: "2000",
        logIndex: "2",
      },
    ];

    (subgraphQueryPaginated as jest.Mock).mockResolvedValue(mockSwaps);

    const result = await getPoolSwap(100, 200);

    expect(blockToTimestamp).toHaveBeenCalledTimes(2);
    expect(blockToTimestamp).toHaveBeenCalledWith(100);
    expect(blockToTimestamp).toHaveBeenCalledWith(200);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: RewardEventType.POOL_SWAP,
      value: 1000000,
      logIndex: 1,
      timestamp: 1000,
    });
    expect(result[1]).toEqual({
      type: RewardEventType.POOL_SWAP,
      value: 2000000,
      logIndex: 2,
      timestamp: 2000,
    });
  });

  it("should handle empty response", async () => {
    (subgraphQueryPaginated as jest.Mock).mockResolvedValue([]);

    const result = await getPoolSwap(100, 200);

    expect(result).toHaveLength(0);
  });
});

describe("getUpdateAccumulatedRateEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch and process accumulated rate events", async () => {
    const mockRateUpdates = [
      {
        id: "event-1",
        rateMultiplier: "1.1",
        createdAt: "1000",
        collateralType: { id: "ETH-A" },
      },
      {
        id: "event-2",
        rateMultiplier: "1.2",
        createdAt: "2000",
        collateralType: { id: "WSTETH-A" },
      },
    ];

    (subgraphQueryPaginated as jest.Mock).mockResolvedValue(mockRateUpdates);

    const result = await getUpdateAccumulatedRateEvent(100, 200);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: RewardEventType.UPDATE_ACCUMULATED_RATE,
      cType: "ETH-A",
      value: 1.1,
      logIndex: expect.any(Number),
      timestamp: 1000,
    });
    expect(result[1]).toEqual({
      type: RewardEventType.UPDATE_ACCUMULATED_RATE,
      cType: "WSTETH-A",
      value: 1.2,
      logIndex: expect.any(Number),
      timestamp: 2000,
    });
  });

  it("should handle empty response", async () => {
    (subgraphQueryPaginated as jest.Mock).mockResolvedValue([]);

    const result = await getUpdateAccumulatedRateEvent(100, 200);

    expect(result).toHaveLength(0);
  });
});

describe("getEvents", () => {
  const mockOwners = new Map([
    ["0xsafe1", "0xowner1"],
    ["0xsafe2", "0xowner2"],
  ]);

  it("should fetch and combine all event types", async () => {
    // Mock safe modifications
    const mockSafeModifications = [
      {
        id: "event-1",
        deltaDebt: "100",
        safeHandler: "0xsafe1",
        createdAt: "1000",
        collateralType: { id: "ETH-A" },
      },
    ];

    // Mock position updates
    const mockPositions = [
      {
        owner: "0xowner2",
        timestamp: "2000",
        liquidity: "1000000",
        position: {
          id: "2",
          tickLower: {
            tickIdx: "-887220",
          },
          tickUpper: {
            tickIdx: "887220",
          },
        },
      },
    ];

    // Mock swaps
    const mockSwaps = [
      {
        sqrtPriceX96: "1000000",
        timestamp: "3000",
        logIndex: "1",
      },
    ];

    // Mock rate updates
    const mockRateUpdates = [
      {
        id: "event-4",
        rateMultiplier: "1.1",
        createdAt: "4000",
        collateralType: { id: "ETH-A" },
      },
    ];

    // Setup mocks
    (subgraphQueryPaginated as jest.Mock).mockImplementation((query, type) => {
      switch (type) {
        case "modifySAFECollateralizations":
          return Promise.resolve(mockSafeModifications);
        case "confiscateSAFECollateralAndDebts":
          return Promise.resolve([]);
        case "transferSAFECollateralAndDebts":
          return Promise.resolve([]);
        case "positionSnapshots":
          return Promise.resolve(mockPositions);
        case "swaps":
          return Promise.resolve(mockSwaps);
        case "updateAccumulatedRates":
          return Promise.resolve(mockRateUpdates);
        default:
          return Promise.resolve([]);
      }
    });

    (getExclusionList as jest.Mock).mockResolvedValue([]);
    (blockToTimestamp as jest.Mock)
      .mockResolvedValueOnce(100000) // for start block
      .mockResolvedValueOnce(200000); // for end block

    const result = await getEvents(100, 200, mockOwners);

    // Verify each event type
    const debtEvents = result.filter(
      (e) => e.type === RewardEventType.DELTA_DEBT
    );
    expect(debtEvents).toHaveLength(1);
    expect(debtEvents[0]).toMatchObject({
      type: RewardEventType.DELTA_DEBT,
      value: 100,
      address: "0xowner1",
      timestamp: 1000,
      cType: "ETH-A",
    });

    const positionEvents = result.filter(
      (e) => e.type === RewardEventType.POOL_POSITION_UPDATE
    );
    expect(positionEvents).toHaveLength(1);
    expect(positionEvents[0]).toMatchObject({
      type: RewardEventType.POOL_POSITION_UPDATE,
      value: {
        tokenId: 2,
        liquidity: 1000000,
        lowerTick: -887220,
        upperTick: 887220,
      },
      address: "0xowner2",
      timestamp: 2000,
    });

    const swapEvents = result.filter(
      (e) => e.type === RewardEventType.POOL_SWAP
    );
    expect(swapEvents).toHaveLength(1);
    expect(swapEvents[0]).toMatchObject({
      type: RewardEventType.POOL_SWAP,
      value: 1000000,
      logIndex: 1,
      timestamp: 3000,
    });

    const rateEvents = result.filter(
      (e) => e.type === RewardEventType.UPDATE_ACCUMULATED_RATE
    );
    expect(rateEvents).toHaveLength(1);
    expect(rateEvents[0]).toMatchObject({
      type: RewardEventType.UPDATE_ACCUMULATED_RATE,
      value: 1.1,
      timestamp: 4000,
      cType: "ETH-A",
    });
  });

  it("should filter out excluded addresses", async () => {
    const mockPositions = [
      {
        owner: "0xexcluded",
        timestamp: "1000",
        liquidity: "1000000",
        position: {
          id: "1",
          tickLower: { tickIdx: "-887220" },
          tickUpper: { tickIdx: "887220" },
        },
      },
    ];

    (subgraphQueryPaginated as jest.Mock)
      .mockResolvedValueOnce([]) // safe modifications
      .mockResolvedValueOnce([]) // confiscations
      .mockResolvedValueOnce([]) // transfers
      .mockResolvedValueOnce(mockPositions) // positions
      .mockResolvedValueOnce([]) // swaps
      .mockResolvedValueOnce([]); // rate updates

    (getExclusionList as jest.Mock).mockResolvedValue(["0xexcluded"]);

    const result = await getEvents(100, 200, mockOwners);

    expect(result).toHaveLength(0);
  });

  it("should sort events by timestamp and logIndex", async () => {
    const mockEvents = [
      {
        id: "event-2",
        deltaDebt: "200",
        safeHandler: "0xsafe1",
        createdAt: "2000",
        collateralType: { id: "ETH-A" },
      },
      {
        id: "event-1",
        deltaDebt: "100",
        safeHandler: "0xsafe1",
        createdAt: "2000", // Same timestamp
        collateralType: { id: "ETH-A" },
      },
    ];

    (subgraphQueryPaginated as jest.Mock)
      .mockResolvedValueOnce(mockEvents) // safe modifications
      .mockResolvedValueOnce([]) // confiscations
      .mockResolvedValueOnce([]) // transfers
      .mockResolvedValueOnce([]) // positions
      .mockResolvedValueOnce([]) // swaps
      .mockResolvedValueOnce([]); // rate updates

    (getExclusionList as jest.Mock).mockResolvedValue([]);

    const result = await getEvents(100, 200, mockOwners);

    expect(result).toHaveLength(2);
    expect(result[0].logIndex).toBeLessThan(result[1].logIndex);
    expect(result[0].timestamp).toBe(result[1].timestamp);
  });

  it("should throw error for inconsistent events", async () => {
    const mockEvents = [
      {
        id: "event-1",
        deltaDebt: "100",
        safeHandler: "0xsafe1",
        // Missing createdAt
        collateralType: { id: "ETH-A" },
      },
    ];

    (subgraphQueryPaginated as jest.Mock)
      .mockResolvedValueOnce(mockEvents) // safe modifications
      .mockResolvedValueOnce([]) // confiscations
      .mockResolvedValueOnce([]) // transfers
      .mockResolvedValueOnce([]) // positions
      .mockResolvedValueOnce([]) // swaps
      .mockResolvedValueOnce([]); // rate updates

    (getExclusionList as jest.Mock).mockResolvedValue([]);

    await expect(getEvents(100, 200, mockOwners)).rejects.toThrow(
      "Inconsistent event"
    );
  });

  it("should validate address requirements for different event types", async () => {
    // Mock swap events with address (which should be invalid)
    const mockSwaps = [
      {
        sqrtPriceX96: "1000000",
        timestamp: "1000",
        logIndex: "1",
      },
    ];

    // Setup mock implementation to return the swap event
    (subgraphQueryPaginated as jest.Mock).mockImplementation((query, type) => {
      switch (type) {
        case "modifySAFECollateralizations":
          return Promise.resolve([]);
        case "confiscateSAFECollateralAndDebts":
          return Promise.resolve([]);
        case "transferSAFECollateralAndDebts":
          return Promise.resolve([]);
        case "positionSnapshots":
          // Return a position update without an address (which should be invalid)
          return Promise.resolve([
            {
              owner: null, // This should trigger the validation error
              timestamp: "1000",
              liquidity: "1000000",
              position: {
                id: "1",
                tickLower: { tickIdx: "-887220" },
                tickUpper: { tickIdx: "887220" },
              },
            },
          ]);
        case "swaps":
          return Promise.resolve(mockSwaps);
        case "updateAccumulatedRates":
          return Promise.resolve([]);
        default:
          return Promise.resolve([]);
      }
    });

    (getExclusionList as jest.Mock).mockResolvedValue([]);
    (blockToTimestamp as jest.Mock)
      .mockResolvedValueOnce(100000)
      .mockResolvedValueOnce(200000);

    await expect(getEvents(100, 200, mockOwners)).rejects.toThrow(
      "Inconsistent event"
    );
  });
});
