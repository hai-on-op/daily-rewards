import fs from "fs";
import path from "path";
import { config } from "../config";
import { LpStakingRewardWindow } from "../config/types";
import { lpStakingProvider } from "../utils/chain";
import {
  getInitialLpStakingState,
  getLpStakingEventsInRange,
} from "../services/lp-staking-data/getInitialLpStakingState";
import { calculateLpStakingRewardsV2 } from "./lp-staking-rewards-v2";

jest.mock("../config", () => ({ config: jest.fn() }));
jest.mock("../utils/chain", () => ({
  lpStakingProvider: { getBlock: jest.fn(), getBlockNumber: jest.fn() },
}));
jest.mock("../services/lp-staking-data/getInitialLpStakingState", () => ({
  getInitialLpStakingState: jest.fn(),
  getLpStakingEventsInRange: jest.fn(),
}));
jest.mock("../services/skite-data", () => ({
  getStakingPositions: jest.fn().mockResolvedValue([]),
  calculateStakingAtTimestamp: jest.fn().mockReturnValue({ users: {} }),
}));

const ACTIVATION_BLOCK = 158082212;
const ACTIVATION_TIMESTAMP = 1791763201;
const BLOCKS_PER_DAY = 43200;
const windows: LpStakingRewardWindow[] = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../config/lp-staking-windows.json"), "utf8")
);
const previousWindows: LpStakingRewardWindow[] = [
  {
    startBlock: 144937170,
    endBlock: 146037861,
    config: { KITE: { HAI_BOLD_CURVE: 25 } },
  },
  {
    startBlock: 146037862,
    config: { KITE: { HAI_BOLD_CURVE: 25, HAI_VELO_VELO: 25 } },
  },
];

function useWindows(value: LpStakingRewardWindow[]) {
  (config as jest.Mock).mockReturnValue({ rewards: { lpStaking: { windows: value } } });
}

describe("HAI/BOLD governance reward transition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    useWindows(windows);
    (lpStakingProvider.getBlockNumber as jest.Mock).mockResolvedValue(
      ACTIVATION_BLOCK + BLOCKS_PER_DAY
    );
    (lpStakingProvider.getBlock as jest.Mock).mockImplementation(async (block: number) => ({
      timestamp: ACTIVATION_TIMESTAMP + (block - ACTIVATION_BLOCK) * 2,
    }));
    (getInitialLpStakingState as jest.Mock).mockResolvedValue({
      "0xalice": { address: "0xalice", collateral: 100 },
      "0xbob": { address: "0xbob", collateral: 300 },
    });
    // Alice exits HAI/BOLD exactly at activation. Her accrued rewards must remain.
    (getLpStakingEventsInRange as jest.Mock).mockImplementation(
      async (stakingType: string, start: number, end: number) =>
        stakingType === "HAI_BOLD_CURVE" && start <= ACTIVATION_TIMESTAMP && end >= ACTIVATION_TIMESTAMP
          ? [{
              user: { id: "0xalice" },
              amount: "100000000000000000000",
              type: "WITHDRAW",
              timestamp: String(ACTIVATION_TIMESTAMP),
            }]
          : []
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it("publishes the approved schedule in the environment template", () => {
    const example = fs.readFileSync(path.resolve(__dirname, "../../env.example"), "utf8");
    const value = example.match(/^REWARD_LP_STAKING_WINDOWS=(.+)$/m)![1];
    expect(JSON.parse(value)).toEqual(windows);
  });

  it.each([ACTIVATION_BLOCK - 1, ACTIVATION_BLOCK])(
    "preserves every user's accrued rewards at block %i",
    async (endBlock) => {
      useWindows(previousWindows);
      const before = await calculateLpStakingRewardsV2(136424800, endBlock);
      useWindows(windows);
      const after = await calculateLpStakingRewardsV2(136424800, endBlock);

      expect(after).toEqual(before);
      expect(lpStakingProvider.getBlockNumber).not.toHaveBeenCalled();
      const requestedBlocks = (lpStakingProvider.getBlock as jest.Mock).mock.calls.map(([block]) => block);
      expect(Math.max(...requestedBlocks)).toBe(endBlock);
    }
  );

  it("adds 50 KITE over the first full block day and retains the exiting user's earnings", async () => {
    const atActivation = await calculateLpStakingRewardsV2(136424800, ACTIVATION_BLOCK);
    const afterDay = await calculateLpStakingRewardsV2(136424800, ACTIVATION_BLOCK + BLOCKS_PER_DAY);

    expect(afterDay.KITE.HAI_BOLD_CURVE["0xalice"].earned).toBe(
      atActivation.KITE.HAI_BOLD_CURVE["0xalice"].earned
    );
    expect(afterDay.KITE.HAI_BOLD_CURVE["0xbob"].earned - atActivation.KITE.HAI_BOLD_CURVE["0xbob"].earned)
      .toBeCloseTo(50, 8);
    expect(afterDay.KITE.HAI_VELO_VELO["0xalice"].earned - atActivation.KITE.HAI_VELO_VELO["0xalice"].earned)
      .toBeCloseTo(6.25, 8);
    expect(afterDay.KITE.HAI_VELO_VELO["0xbob"].earned - atActivation.KITE.HAI_VELO_VELO["0xbob"].earned)
      .toBeCloseTo(18.75, 8);
  });

  it("prorates partial days at the new rate", async () => {
    const atActivation = await calculateLpStakingRewardsV2(136424800, ACTIVATION_BLOCK);
    const afterHalfDay = await calculateLpStakingRewardsV2(136424800, ACTIVATION_BLOCK + BLOCKS_PER_DAY / 2);
    expect(afterHalfDay.KITE.HAI_BOLD_CURVE["0xbob"].earned - atActivation.KITE.HAI_BOLD_CURVE["0xbob"].earned)
      .toBeCloseTo(25, 8);
  });

  it("keeps haiVELO-VELO earnings identical to the previous configuration", async () => {
    const endBlock = ACTIVATION_BLOCK + 3 * BLOCKS_PER_DAY;
    useWindows(previousWindows);
    const before = await calculateLpStakingRewardsV2(136424800, endBlock);
    useWindows(windows);
    const after = await calculateLpStakingRewardsV2(136424800, endBlock);
    expect(after.KITE.HAI_VELO_VELO).toEqual(before.KITE.HAI_VELO_VELO);
  });

  it("caps closed windows at chain head and skips the future increase", async () => {
    const endBlock = ACTIVATION_BLOCK - BLOCKS_PER_DAY;
    (lpStakingProvider.getBlockNumber as jest.Mock).mockResolvedValue(endBlock);
    const fromHead = await calculateLpStakingRewardsV2(136424800);
    const fromCutoff = await calculateLpStakingRewardsV2(136424800, endBlock);
    expect(fromHead).toEqual(fromCutoff);
    expect(lpStakingProvider.getBlockNumber).toHaveBeenCalledTimes(1);
    const requestedBlocks = (lpStakingProvider.getBlock as jest.Mock).mock.calls.map(([block]) => block);
    expect(Math.max(...requestedBlocks)).toBe(endBlock);
  });

  it("does not calculate rewards when the cutoff precedes all campaigns", async () => {
    expect(await calculateLpStakingRewardsV2(136424800, 144937170)).toEqual({});
    expect(lpStakingProvider.getBlock).not.toHaveBeenCalled();
    expect(getInitialLpStakingState).not.toHaveBeenCalled();
  });
});
