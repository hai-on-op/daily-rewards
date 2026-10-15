import fs from "fs";
import path from "path";
import { config } from "../config";
import { MinterRewardWindow } from "../config/types";
import { minterProvider } from "../utils/chain";
import { getInitialState } from "../services/initial-data/getInitialState";
import { getEvents } from "../services/get-events/minterGetEvents";
import { RewardEventType } from "../types";
import { getDynamicTotalReward } from "./dynamic-reward-calculator";
import { calculateMinterRewardsV2 } from "./minter-rewards-v2";

jest.mock("../config", () => ({ config: jest.fn() }));
jest.mock("../utils/chain", () => ({
  minterProvider: { getBlock: jest.fn(), getBlockNumber: jest.fn() },
}));
jest.mock("../services/initial-data/getInitialState", () => ({ getInitialState: jest.fn() }));
jest.mock("../services/initial-data/getSafeOwnerMapping", () => ({
  getSafeOwnerMapping: jest.fn().mockResolvedValue(new Map()),
}));
jest.mock("../services/initial-data/getAccumulatedRate", () => ({
  getAccumulatedRate: jest.fn().mockResolvedValue(1),
}));
jest.mock("../services/get-events/minterGetEvents", () => ({ getEvents: jest.fn() }));
jest.mock("./dynamic-reward-calculator", () => ({ getDynamicTotalReward: jest.fn() }));

const ACTIVATION_BLOCK = 158255012;
const ACTIVATION_TIMESTAMP = Date.parse("2026-10-16T00:00:01Z") / 1000;
const BLOCKS_PER_DAY = 43200;
const windows: MinterRewardWindow[] = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../config/minter-windows.json"), "utf8")
);
const previousWindows: MinterRewardWindow[] = [
  ...windows.slice(0, 8),
  {
    startBlock: 154658587,
    config: {
      KITE: {
        HAIVELO: 0,
        ALETH: 0,
        "YV-VELO-ALETH-WETH": 0,
        MSETH: 25,
        "YV-VELO-MSETH-WETH": 25,
        HAIVELOV2: 50,
        "MOO-VELO-BOLD-LUSD": 25,
        HAIAERO: 50,
      },
    },
  },
];

function useWindows(value: MinterRewardWindow[]) {
  (config as jest.Mock).mockReturnValue({
    rewards: { minter: { windows: value } },
    MINTER_GEB_SUBGRAPH_URL: "http://test",
  });
}

type Result = Awaited<ReturnType<typeof calculateMinterRewardsV2>>;

function total(result: Result, collateral: string): number {
  return Object.values(result.KITE[collateral]).reduce((sum, user) => sum + user.earned, 0);
}

describe("Borrowing incentive governance transition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    useWindows(windows);
    (minterProvider.getBlockNumber as jest.Mock).mockResolvedValue(ACTIVATION_BLOCK + BLOCKS_PER_DAY);
    (minterProvider.getBlock as jest.Mock).mockImplementation(async (block: number) => ({
      timestamp: ACTIVATION_TIMESTAMP + (block - ACTIVATION_BLOCK) * 2,
    }));
    (getInitialState as jest.Mock).mockResolvedValue({
      "0xalice": { address: "0xalice", debt: 100, collateral: 200 },
      "0xbob": { address: "0xbob", debt: 300, collateral: 600 },
    });
    (getEvents as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());

  it("publishes the tested schedule in the environment template", () => {
    const example = fs.readFileSync(path.resolve(__dirname, "../../env.example"), "utf8");
    expect(JSON.parse(example.match(/^REWARD_MINTER_WINDOWS=(.+)$/m)![1])).toEqual(windows);
  });

  it.each([158200987, ACTIVATION_BLOCK - 1, ACTIVATION_BLOCK])(
    "preserves every borrower's earnings through block %i",
    async (endBlock) => {
      useWindows(previousWindows);
      const before = await calculateMinterRewardsV2(137678333, endBlock);
      useWindows(windows);
      const after = await calculateMinterRewardsV2(137678333, endBlock);
      expect(after).toEqual(before);
      expect(minterProvider.getBlockNumber).not.toHaveBeenCalled();
      const requestedBlocks = (minterProvider.getBlock as jest.Mock).mock.calls.map(([block]) => block);
      expect(Math.max(...requestedBlocks)).toBe(endBlock);
    }
  );

  it("changes the combined budget from 75 to 20 KITE/day and retains historical msETH rewards", async () => {
    const dayBefore = await calculateMinterRewardsV2(137678333, ACTIVATION_BLOCK - BLOCKS_PER_DAY);
    const atActivation = await calculateMinterRewardsV2(137678333, ACTIVATION_BLOCK);
    const afterDay = await calculateMinterRewardsV2(137678333, ACTIVATION_BLOCK + BLOCKS_PER_DAY);

    for (const collateral of ["MSETH", "YV-VELO-MSETH-WETH", "MOO-VELO-BOLD-LUSD"]) {
      expect(total(atActivation, collateral) - total(dayBefore, collateral)).toBeCloseTo(25, 8);
    }
    expect(afterDay.KITE.MSETH).toEqual(atActivation.KITE.MSETH);
    expect(total(atActivation, "MSETH")).toBeGreaterThan(0);
    expect(total(afterDay, "YV-VELO-MSETH-WETH") - total(atActivation, "YV-VELO-MSETH-WETH"))
      .toBeCloseTo(10, 8);
    expect(total(afterDay, "MOO-VELO-BOLD-LUSD") - total(atActivation, "MOO-VELO-BOLD-LUSD"))
      .toBeCloseTo(10, 8);
    for (const collateral of ["HAIVELOV2", "HAIAERO"]) {
      expect(total(afterDay, collateral) - total(atActivation, collateral)).toBeCloseTo(50, 8);
    }
  });

  it("prorates partial days at the reduced rates", async () => {
    const atActivation = await calculateMinterRewardsV2(137678333, ACTIVATION_BLOCK);
    const afterHalfDay = await calculateMinterRewardsV2(137678333, ACTIVATION_BLOCK + BLOCKS_PER_DAY / 2);
    for (const collateral of ["YV-VELO-MSETH-WETH", "MOO-VELO-BOLD-LUSD"]) {
      expect(total(afterHalfDay, collateral) - total(atActivation, collateral)).toBeCloseTo(5, 8);
    }
    expect(afterHalfDay.KITE.MSETH).toEqual(atActivation.KITE.MSETH);
  });

  it("keeps unrelated campaign results identical to the previous schedule", async () => {
    const endBlock = ACTIVATION_BLOCK + 3 * BLOCKS_PER_DAY;
    useWindows(previousWindows);
    const before = await calculateMinterRewardsV2(137678333, endBlock);
    useWindows(windows);
    const after = await calculateMinterRewardsV2(137678333, endBlock);
    for (const collateral of ["HAIVELO", "ALETH", "YV-VELO-ALETH-WETH", "HAIVELOV2", "HAIAERO"]) {
      expect(after.KITE[collateral]).toEqual(before.KITE[collateral]);
    }
  });

  it("retains accrued rewards for a borrower who repays at the transition", async () => {
    (getEvents as jest.Mock).mockImplementation(async (start: number, end: number, _owners: unknown, cType: string) =>
      cType === "YV-VELO-MSETH-WETH" && start <= ACTIVATION_BLOCK && end >= ACTIVATION_BLOCK
        ? [{
            type: RewardEventType.DELTA_DEBT,
            timestamp: ACTIVATION_TIMESTAMP,
            address: "0xalice",
            value: -100,
            complementaryValue: 0,
            cType,
            createdAtBlock: ACTIVATION_BLOCK,
            logIndex: 0,
          }]
        : []
    );
    useWindows(previousWindows);
    const previousEntitlements = await calculateMinterRewardsV2(137678333, ACTIVATION_BLOCK);
    useWindows(windows);
    const atActivation = await calculateMinterRewardsV2(137678333, ACTIVATION_BLOCK);
    const afterDay = await calculateMinterRewardsV2(137678333, ACTIVATION_BLOCK + BLOCKS_PER_DAY);
    const collateral = "YV-VELO-MSETH-WETH";
    expect(atActivation).toEqual(previousEntitlements);
    expect(afterDay.KITE[collateral]["0xalice"].earned).toBe(atActivation.KITE[collateral]["0xalice"].earned);
    // Budget assertions above use stable positions. Repayment changes exercise
    // the existing boost-timing behavior documented in docs/boost-audit-handoff.md;
    // this regression checks preservation without redefining that accounting.
  });

  it("caps the old window at chain head and never queries the future activation block", async () => {
    const endBlock = ACTIVATION_BLOCK - BLOCKS_PER_DAY;
    (minterProvider.getBlockNumber as jest.Mock).mockResolvedValue(endBlock);
    const fromHead = await calculateMinterRewardsV2(137678333);
    const fromCutoff = await calculateMinterRewardsV2(137678333, endBlock);
    expect(fromHead).toEqual(fromCutoff);
    expect(minterProvider.getBlockNumber).toHaveBeenCalledTimes(1);
    const requestedBlocks = (minterProvider.getBlock as jest.Mock).mock.calls.map(([block]) => block);
    expect(Math.max(...requestedBlocks)).toBe(endBlock);
  });

  it("skips campaigns that have not started", async () => {
    expect(await calculateMinterRewardsV2(137678333, 137678333)).toEqual({});
    expect(minterProvider.getBlock).not.toHaveBeenCalled();
    expect(getInitialState).not.toHaveBeenCalled();
  });

  it("also caps the block range passed to a dynamic reward calculator", async () => {
    useWindows([{
      startBlock: ACTIVATION_BLOCK - BLOCKS_PER_DAY,
      endBlock: ACTIVATION_BLOCK + BLOCKS_PER_DAY,
      mode: "dynamic",
      config: { KITE: { MSETH: 0.5 } },
    }]);
    (getDynamicTotalReward as jest.Mock).mockResolvedValue(200);
    const result = await calculateMinterRewardsV2(137678333, ACTIVATION_BLOCK);
    expect(getDynamicTotalReward).toHaveBeenCalledWith("KITE", {
      startBlock: ACTIVATION_BLOCK - BLOCKS_PER_DAY,
      endBlock: ACTIVATION_BLOCK,
    });
    expect(total(result, "MSETH")).toBeCloseTo(100, 8);
  });
});
