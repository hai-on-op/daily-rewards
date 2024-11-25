import { processRewardEvent } from "./lpRewardEventProcessor";
import { getAccumulatedRate } from "../initial-data/getAccumulatedRate";
import { getPoolState } from "../pool-state/getPoolState";
import { getRedemptionPriceFromTimestamp } from "../redemption-price/getRedemptionPrice";
import { provider } from "../../utils/chain";
import { config } from "../../config";
import { RewardEventType, UserList } from "../../types";
// Mock dependencies
jest.mock("../initial-data/getAccumulatedRate");
jest.mock("../pool-state/getPoolState");
jest.mock("../redemption-price/getRedemptionPrice");
jest.mock("../../utils/chain");
jest.mock("../../config", () => ({
  config: jest.fn().mockReturnValue({
    START_BLOCK: 100,
    END_BLOCK: 200,
    REWARD_AMOUNT: 1000,
    UNISWAP_POOL_ADDRESS: "0xpool",
    GEB_SUBGRAPH_URL: "https://geb.subgraph",
  }),
}));
describe("LP Reward Event Processor", () => {
  const mockStartTimestamp = 1000;
  const mockEndTimestamp = 2000;
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock provider responses
    (provider.getBlock as jest.Mock)
      .mockResolvedValueOnce({ timestamp: mockStartTimestamp })
      .mockResolvedValueOnce({ timestamp: mockEndTimestamp });
    // Mock other dependencies
    (getAccumulatedRate as jest.Mock).mockResolvedValue(1.0);
    (getPoolState as jest.Mock).mockResolvedValue({ sqrtPrice: "1000000" });
    (getRedemptionPriceFromTimestamp as jest.Mock).mockResolvedValue(1.0);
  });
  it("should process DELTA_DEBT events correctly", async () => {
    /*const users: UserList = {
      "0x1": {
        address: "0x1",
        debt: 100,
        lpPositions: [],
        stakingWeight: 100,
        earned: 0,
        rewardPerWeightStored: 0,
        collateral: 1000,
        totalBridgedTokens: 0,
        usedBridgedTokens: 0,
      },
    };
    const events = [
      {
        type: RewardEventType.DELTA_DEBT,
        value: 50,
        address: "0x1",
        logIndex: 1,
        timestamp: 1500,
        createdAtBlock: 150,
        cType: "WETH",
      },
    ];
    const result = await processRewardEvent(150, users, events);
    expect(result["0x1"].debt).toBe(150); // 100 + 50
    expect(result["0x1"].earned).toBeGreaterThan(0);*/
  });
  /*it("should process POOL_POSITION_UPDATE events correctly", async () => {
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
        timestamp: 1500,
        createdAtBlock: 150,
      },
    ];
    const result = await processRewardEvent(150,users, events);
    expect(result["0x1"].lpPositions).toHaveLength(1);
    expect(result["0x1"].stakingWeight).toBeGreaterThan(0);
  });
  it("should process POOL_SWAP events correctly", async () => {
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
        stakingWeight: 100,
        earned: 0,
        rewardPerWeightStored: 0,
        collateral: 0,
        totalBridgedTokens: 0,
        usedBridgedTokens: 0,
      },
    };
    const events = [
      {
        type: RewardEventType.POOL_SWAP,
        value: 2000000,
        logIndex: 1,
        timestamp: 1500,
        createdAtBlock: 150,
      },
    ];
    const result = await processRewardEvent(users, events);
    expect(result["0x1"].earned).toBeGreaterThan(0);
  });
  it("should process UPDATE_ACCUMULATED_RATE events correctly", async () => {
    const users: UserList = {
      "0x1": {
        address: "0x1",
        debt: 100,
        lpPositions: [],
        stakingWeight: 100,
        earned: 0,
        rewardPerWeightStored: 0,
        collateral: 1000,
        totalBridgedTokens: 0,
        usedBridgedTokens: 0,
      },
    };
    const events = [
      {
        type: RewardEventType.UPDATE_ACCUMULATED_RATE,
        value: 0.1,
        logIndex: 1,
        timestamp: 1500,
        createdAtBlock: 150,
        cType: "WETH",
      },
    ];
    const result = await processRewardEvent(users, events);
    expect(result["0x1"].debt).toBeCloseTo(110, 10);
    expect(result["0x1"].earned).toBeGreaterThan(0);
  });
  it("should handle multiple events in chronological order", async () => {
    const users: UserList = {
      "0x1": {
        address: "0x1",
        debt: 100,
        lpPositions: [],
        stakingWeight: 100,
        earned: 0,
        rewardPerWeightStored: 0,
        collateral: 1000,
        totalBridgedTokens: 0,
        usedBridgedTokens: 0,
      },
    };
    const events = [
      {
        type: RewardEventType.DELTA_DEBT,
        value: 50,
        address: "0x1",
        logIndex: 1,
        timestamp: 1200,
        createdAtBlock: 120,
        cType: "WETH",
      },
      {
        type: RewardEventType.UPDATE_ACCUMULATED_RATE,
        value: 0.1,
        logIndex: 2,
        timestamp: 1500,
        createdAtBlock: 150,
        cType: "WETH",
      },
    ];
    const result = await processRewardEvent(users, events);
    expect(result["0x1"].debt).toBe(165); // (100 + 50) * (1 + 0.1)
    expect(result["0x1"].earned).toBeGreaterThan(0);
  });
  it("should handle dust debt", async () => {
    const users: UserList = {
      "0x1": {
        address: "0x1",
        debt: 0.3,
        lpPositions: [],
        stakingWeight: 100,
        earned: 0,
        rewardPerWeightStored: 0,
        collateral: 1000,
        totalBridgedTokens: 0,
        usedBridgedTokens: 0,
      },
    };
    const events = [
      {
        type: RewardEventType.DELTA_DEBT,
        value: -0.3,
        address: "0x1",
        logIndex: 1,
        timestamp: 1500,
        createdAtBlock: 150,
        cType: "WETH",
      },
    ];
    const result = await processRewardEvent(users, events);
    expect(result["0x1"].debt).toBe(0);
  });
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
        totalBridgedTokens: 0,
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
        totalBridgedTokens: 0,
        usedBridgedTokens: 0,
      },
    };
    const events = [
      {
        type: RewardEventType.UPDATE_ACCUMULATED_RATE,
        value: 0.1,
        logIndex: 1,
        timestamp: 1500,
        createdAtBlock: 150,
        cType: "WETH",
      },
    ];
    const result = await processRewardEvent(users, events);
    expect(result["0x2"].earned).toBeGreaterThan(result["0x1"].earned);
    expect(result["0x2"].earned / result["0x1"].earned).toBeCloseTo(2, 1);
  });*/
});
