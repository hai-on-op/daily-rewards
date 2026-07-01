/**
 * Daily Reward Report — Single-Run with Day-Level Breakdown
 *
 * Runs the full reward calculation once (start blocks → now) and uses
 * day-boundary snapshots produced by TimeWeightedDistributor to derive
 * per-day earnings for each user and strategy.
 *
 * For each strategy invocation the distributor snapshots the cumulative
 * earned map at every midnight UTC. Diffing consecutive snapshots gives
 * the daily delta — what each user earned that day.
 *
 * Usage:
 *   yarn daily-report                 # last 30 days
 *   yarn daily-report --days 7        # last 7 days
 *
 * Environment:
 *   Requires the same .env as the main reward distribution pipeline.
 */

import { config as dotenv } from "dotenv";
dotenv();

import fs from "fs";
import path from "path";
import { config } from "../config";
import { subgraphQueryPaginated } from "../services/subgraph/utils";
import {
  calculateStrategyRewardsDetailed,
} from "../core/rewards/calculateRewards";
import { DailySnapshot } from "../core/rewards/TimeWeightedDistributor";
import { MinterStrategy } from "../core/rewards/strategies/MinterStrategy";
import { HaiVeloStrategy } from "../core/rewards/strategies/HaiVeloStrategy";
import { HaiAeroStrategy } from "../core/rewards/strategies/HaiAeroStrategy";
import { LpStakingStrategy } from "../core/rewards/strategies/LpStakingStrategy";
import { LpStrategy } from "../core/rewards/strategies/LpStrategy";
import { LpStakingType } from "../config/types";
import {
  getTokenTransfersToContract,
  getHaiaeroTokenTransfersToContract,
  TokenTransfer,
} from "../services/reward-distributor-deposits";
import { getSafeOwnerMapping } from "../services/initial-data/getSafeOwnerMapping";
import {
  getRawHaiveloCollateralData,
  processHaiveloCollateral,
} from "../services/initial-data/getInitialHaiveloState";
import {
  getRawHaiaeroCollateralData,
  processHaiaeroCollateral,
} from "../services/initial-data/getInitialHaiaeroState";
import {
  getLpStakingPositions,
  calculateLpStakingAtTimestamp,
} from "../services/lp-staking-data";
import {
  buildLpPositionsQuery,
  fetchLpPositions,
} from "../services/initial-data/getInitialLpPosition";
import {
  getStakingPositions,
  calculateStakingAtTimestamp,
} from "../services/skite-data";

// ── Constants ──────────────────────────────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────

interface MinterPosition {
  totalDebt: number;
  byCollateral: Record<string, number>;
}

/** One strategy's contribution, tagged with name and token */
interface StrategyDailyEntry {
  strategy: string;
  token: string;
  /** dayTimestamp → per-user earned delta for that day */
  dailyEarned: Map<number, Map<string, number>>;
  /** dayTimestamp → total pool earned delta for that day */
  dailyTotal: Map<number, number>;
  /** dayTimestamp → per-user time-weighted avg boosted weight */
  dailyWeights: Map<number, Map<string, number>>;
  /** dayTimestamp → per-user time-weighted avg position (real units) */
  dailyAvgPositions: Map<number, Map<string, number>>;
  /** dayTimestamp → per-user point-in-time end-of-day weight */
  dailyEodWeights: Map<number, Map<string, number>>;
  /** dayTimestamp → per-user boost at end of day */
  dailyBoosts: Map<number, Map<string, number>>;
  /** dayTimestamp → time-weighted avg total position (sum of getWeight, real units) */
  dailyAvgTotalPosition: Map<number, number>;
  /** dayTimestamp → time-weighted avg total boosted weight */
  dailyTotalWeight: Map<number, number>;
  /** dayTimestamp → time-weighted avg total unboosted weight */
  dailyTotalUnboostedWeight: Map<number, number>;
}

interface StrategyPositionData {
  /** Time-weighted avg boosted weight for this day */
  avgWeight: number;
  /** Time-weighted avg unboosted weight for this day */
  avgUnboostedWeight: number;
  /** Time-weighted avg total boosted weight for this day */
  avgTotalWeight: number;
  /** Time-weighted avg total unboosted weight for this day */
  avgTotalUnboostedWeight: number;
  /** Time-weighted avg position in real units (debt, collateral, LP staked) */
  avgPosition: number;
  /** Time-weighted avg total position across all users (real units) */
  avgTotalPosition: number;
  /** Point-in-time weight at end of day */
  endOfDayWeight: number;
  /** Point-in-time boost at end of day */
  endOfDayBoost: number;
  /** True if this reward is based on a delayed position (~7 days ago) */
  isDelayed: boolean;
}

interface DailyUserData {
  dailyEarned: Record<string, number>;
  dailyStrategyEarned: Record<string, Record<string, number>>;
  /** Share of each strategy's daily pool (user delta / total delta) */
  dailyStrategyShare: Record<string, Record<string, number>>;
  /** Per-strategy position weight data */
  strategyPositions: Record<string, Record<string, StrategyPositionData>>;
  kiteStaked: number;
  kiteShare: number;
  boosts: Record<string, number>;
  hasBoostedPosition: boolean;
}

interface DailyReport {
  dayTimestamp: number;
  date: string;
  strategyTotals: { strategy: string; token: string; totalReward: number }[];
  totalRewardByToken: Record<string, number>;
  totalBoostedPositions: number;
  users: Record<string, DailyUserData>;
}

interface UserAverage {
  address: string;
  avgDailyEarnedByToken: Record<string, number>;
  avgDailyStrategyEarned: Record<string, Record<string, number>>;
  avgDailyStrategyShare: Record<string, Record<string, number>>;
  avgKiteStaked: number;
  avgKiteShare: number;
  avgBoosts: Record<string, number>;
  daysActive: number;
}

interface ReportOutput {
  generatedAt: string;
  periodDays: number;
  totalDaysWithData: number;
  globalAverages: {
    avgDailyRewardByToken: Record<string, number>;
    avgBoostedPositions: number;
    avgDailyStrategyTotals: {
      strategy: string;
      token: string;
      avgDailyTotal: number;
    }[];
  };
  dailyReports: DailyReport[];
  users: UserAverage[];
}

// ── CLI args ───────────────────────────────────────────────────────────

function parseDaysArg(): number {
  const idx = process.argv.indexOf("--days");
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    if (n > 0) return n;
  }
  return 30;
}

// ── Snapshot diffing helpers ───────────────────────────────────────────

/**
 * Convert an array of cumulative DailySnapshots into per-day deltas.
 * Returns a Map of dayTimestamp → Map<address, dailyEarned>.
 * Also returns per-day totals.
 */
function diffSnapshots(snapshots: DailySnapshot[]): Omit<StrategyDailyEntry, 'strategy' | 'token'> {
  const dailyEarned = new Map<number, Map<string, number>>();
  const dailyTotal = new Map<number, number>();
  const dailyWeights = new Map<number, Map<string, number>>();
  const dailyAvgPositions = new Map<number, Map<string, number>>();
  const dailyAvgTotalPosition = new Map<number, number>();
  const dailyEodWeights = new Map<number, Map<string, number>>();
  const dailyBoosts = new Map<number, Map<string, number>>();
  const dailyTotalWeight = new Map<number, number>();
  const dailyTotalUnboostedWeight = new Map<number, number>();

  for (let i = 0; i < snapshots.length; i++) {
    const curr = snapshots[i];
    const prev = i > 0 ? snapshots[i - 1] : null;

    const dayDeltas = new Map<string, number>();
    let daySum = 0;

    for (const [addr, cumEarned] of curr.earned) {
      const prevEarned = prev ? prev.earned.get(addr) || 0 : 0;
      const delta = cumEarned - prevEarned;
      if (delta > 0) {
        dayDeltas.set(addr, delta);
        daySum += delta;
      }
    }

    dailyEarned.set(curr.dayTimestamp, dayDeltas);
    dailyTotal.set(curr.dayTimestamp, daySum);

    // Time-weighted avg weights, positions, and point-in-time data
    dailyWeights.set(curr.dayTimestamp, curr.avgWeights);
    dailyAvgPositions.set(curr.dayTimestamp, curr.avgPositions);
    dailyAvgTotalPosition.set(curr.dayTimestamp, curr.avgTotalPosition);
    dailyEodWeights.set(curr.dayTimestamp, curr.weights);
    dailyBoosts.set(curr.dayTimestamp, curr.boosts);
    dailyTotalWeight.set(curr.dayTimestamp, curr.avgTotalWeight);
    dailyTotalUnboostedWeight.set(curr.dayTimestamp, curr.avgTotalUnboostedWeight);
  }

  return {
    dailyEarned, dailyTotal,
    dailyWeights, dailyAvgPositions, dailyAvgTotalPosition, dailyEodWeights, dailyBoosts, dailyTotalWeight, dailyTotalUnboostedWeight,
  };
}

// ── Transfer processing (mirrors result-combiner logic) ────────────────

interface ProcessedTransfer {
  blockNumber: number;
  value: number;
  tokenSymbol: string;
}

async function getProcessedTransfers(): Promise<ProcessedTransfer[]> {
  const FILTER_CONSTANT = 10 ** 18;
  const transfers: TokenTransfer[] = await getTokenTransfersToContract();
  return transfers
    .filter((t) => Number(t.value) >= FILTER_CONSTANT)
    .map((t) => ({
      blockNumber: t.blockNumber,
      value: Number(t.value) / 10 ** 18,
      tokenSymbol: t.tokenSymbol,
    }));
}

async function getHaiaeroProcessedTransfers(): Promise<ProcessedTransfer[]> {
  const FILTER_CONSTANT = 10 ** 18;
  const transfers: TokenTransfer[] =
    await getHaiaeroTokenTransfersToContract();
  return transfers
    .filter((t) => Number(t.value) >= FILTER_CONSTANT)
    .map((t) => ({
      blockNumber: t.blockNumber,
      value: Number(t.value) / 10 ** 18,
      tokenSymbol: t.tokenSymbol,
    }));
}

// ── Strategy execution with daily snapshots ────────────────────────────

/**
 * Run all strategies (mirroring result-combiner's combineResultsDetailed)
 * but collecting daily snapshots from the TimeWeightedDistributor.
 */
async function runAllStrategiesWithSnapshots(): Promise<StrategyDailyEntry[]> {
  const entries: StrategyDailyEntry[] = [];

  // Set current end blocks (like PrepareConfigStep does in the orchestrator).
  // Without this, stale values from .env are used and strategies end too early.
  const { haiveloProvider: hvProv, minterProvider: mtProv, lpStakingProvider: lsProv } =
    await import("../utils/chain");
  const [hvBlock, mtBlock, lsBlock] = await Promise.all([
    hvProv.getBlockNumber(),
    mtProv.getBlockNumber(),
    lsProv.getBlockNumber(),
  ]);
  const delay = 30;
  process.env.HAIVELO_END_BLOCK = String(hvBlock - delay);
  process.env.HAIAERO_END_BLOCK = String(hvBlock - delay);
  process.env.LP_END_BLOCK = String(hvBlock - delay);
  process.env.END_BLOCK = String(hvBlock - delay);
  process.env.MINTER_END_BLOCK = String(mtBlock - delay);
  process.env.LP_STAKING_END_BLOCK = String(lsBlock - delay);

  const cfg = config();

  // ── HaiVelo historical ──
  const processedTransfers = await getProcessedTransfers();
  const REWARD_DEPOSIT_EPOCH_BLOCK = (7 * 24 * 60 * 60) / 2;

  const earliestTransferBlock =
    processedTransfers.length > 0
      ? Math.min(...processedTransfers.map((t) => t.blockNumber))
      : 0;

  if (earliestTransferBlock > 0) {
    for (const [rewardToken, amount] of Object.entries(
      cfg.rewards.haiVelo.historicConfig
    )) {
      console.log(`  Running haiVELO-historical for ${rewardToken}...`);
      const { haiveloProvider } = await import("../utils/chain");
      const strategy = new HaiVeloStrategy(haiveloProvider);
      const result = await calculateStrategyRewardsDetailed(
        strategy,
        {
          startBlock: cfg.HAIVELO_HISTORIC_START_BLOCK,
          endBlock: earliestTransferBlock - REWARD_DEPOSIT_EPOCH_BLOCK,
        },
        amount,
        haiveloProvider
      );
      const diffs = diffSnapshots(result.dailySnapshots);
      entries.push({
        strategy: "haiVELO-historical",
        token: rewardToken,
        ...diffs,
      });
    }
  }

  // ── HaiVelo daily (transfer-based epochs) ──
  for (let i = 0; i < processedTransfers.length; i++) {
    const t = processedTransfers[i];
    let startBlock: number, endBlock: number, rewardsAmount: number;

    if (processedTransfers.length === 1) {
      const calcBlock = cfg.HAIVELO_END_BLOCK;
      rewardsAmount =
        (t.value * (calcBlock - t.blockNumber)) / REWARD_DEPOSIT_EPOCH_BLOCK;
      startBlock = t.blockNumber - REWARD_DEPOSIT_EPOCH_BLOCK;
      endBlock = calcBlock - REWARD_DEPOSIT_EPOCH_BLOCK;
    } else if (i === 0) {
      rewardsAmount = t.value;
      startBlock = t.blockNumber - REWARD_DEPOSIT_EPOCH_BLOCK;
      endBlock = t.blockNumber;
    } else if (i === processedTransfers.length - 1) {
      const calcBlock = cfg.HAIVELO_END_BLOCK;
      const prev = processedTransfers[i - 1];
      rewardsAmount =
        ((calcBlock - t.blockNumber) / REWARD_DEPOSIT_EPOCH_BLOCK) * t.value;
      startBlock = prev.blockNumber;
      endBlock = calcBlock - REWARD_DEPOSIT_EPOCH_BLOCK;
    } else {
      const prev = processedTransfers[i - 1];
      rewardsAmount = t.value;
      startBlock = prev.blockNumber;
      endBlock = t.blockNumber;
    }

    console.log(`  Running haiVELO epoch ${i} for ${t.tokenSymbol}...`);
    const { haiveloProvider } = await import("../utils/chain");
    const strategy = new HaiVeloStrategy(haiveloProvider);
    const result = await calculateStrategyRewardsDetailed(
      strategy,
      { startBlock, endBlock },
      rewardsAmount,
      haiveloProvider
    );
    const diffs = diffSnapshots(result.dailySnapshots);
    entries.push({ strategy: "haiVELO", token: t.tokenSymbol, ...diffs });
  }

  // ── HaiAero daily (transfer-based epochs) ──
  if (cfg.HAIAERO_REWARDS_ENABLED) {
    const haiaeroTransfers = await getHaiaeroProcessedTransfers();
    for (let i = 0; i < haiaeroTransfers.length; i++) {
      const t = haiaeroTransfers[i];
      let startBlock: number, endBlock: number, rewardsAmount: number;

      if (haiaeroTransfers.length === 1) {
        const calcBlock = cfg.HAIAERO_END_BLOCK;
        rewardsAmount =
          (t.value * (calcBlock - t.blockNumber)) / REWARD_DEPOSIT_EPOCH_BLOCK;
        startBlock = t.blockNumber - REWARD_DEPOSIT_EPOCH_BLOCK;
        endBlock = calcBlock - REWARD_DEPOSIT_EPOCH_BLOCK;
      } else if (i === 0) {
        rewardsAmount = t.value;
        startBlock = t.blockNumber - REWARD_DEPOSIT_EPOCH_BLOCK;
        endBlock = t.blockNumber;
      } else if (i === haiaeroTransfers.length - 1) {
        const calcBlock = cfg.HAIAERO_END_BLOCK;
        const prev = haiaeroTransfers[i - 1];
        rewardsAmount =
          ((calcBlock - t.blockNumber) / REWARD_DEPOSIT_EPOCH_BLOCK) * t.value;
        startBlock = prev.blockNumber;
        endBlock = calcBlock - REWARD_DEPOSIT_EPOCH_BLOCK;
      } else {
        const prev = haiaeroTransfers[i - 1];
        rewardsAmount = t.value;
        startBlock = prev.blockNumber;
        endBlock = t.blockNumber;
      }

      console.log(`  Running haiAERO epoch ${i} for ${t.tokenSymbol}...`);
      const { haiveloProvider } = await import("../utils/chain");
      const strategy = new HaiAeroStrategy();
      const result = await calculateStrategyRewardsDetailed(
        strategy,
        { startBlock, endBlock },
        rewardsAmount,
        haiveloProvider
      );
      const diffs = diffSnapshots(result.dailySnapshots);
      entries.push({ strategy: "haiAERO", token: t.tokenSymbol, ...diffs });
    }
  }

  // ── LP historical ──
  for (const [rewardToken, amount] of Object.entries(
    cfg.rewards.lp.historicConfig
  )) {
    console.log(`  Running LP-historical for ${rewardToken}...`);
    const { lpProvider } = await import("../utils/chain");
    const strategy = new LpStrategy(lpProvider, cfg.LP_GEB_SUBGRAPH_URL);
    const result = await calculateStrategyRewardsDetailed(
      strategy,
      {
        startBlock: cfg.LP_HISTORIC_START_BLOCK,
        endBlock: cfg.LP_START_BLOCK,
      },
      amount,
      lpProvider
    );
    const diffs = diffSnapshots(result.dailySnapshots);
    entries.push({ strategy: "LP", token: rewardToken, ...diffs });
  }

  // ── Minter (multi-window, multi-collateral) ──
  const { minterProvider } = await import("../utils/chain");
  const minterSetup = cfg.rewards.minter;
  let minterLatestBlock: number | undefined;

  for (let w = 0; w < minterSetup.windows.length; w++) {
    const window = minterSetup.windows[w];
    if (!minterLatestBlock && !window.endBlock) {
      minterLatestBlock = await minterProvider.getBlockNumber();
    }
    const effectiveEndBlock =
      window.endBlock ?? cfg.MINTER_END_BLOCK ?? minterLatestBlock!;
    const rewardTokens = Object.keys(window.config);

    for (const rewardToken of rewardTokens) {
      const collateralTypes = Object.keys(window.config[rewardToken] || {});

      for (const cType of collateralTypes) {
        const startBlock = window.startBlock;
        const endBlock = effectiveEndBlock;

        // resolveRewardAmount logic
        const configValue = window.config[rewardToken]?.[cType] ?? 0;
        let rewardAmount: number;
        if (!window.mode || window.mode === "fixed") {
          const totalBlocks = endBlock - startBlock;
          const blocksInDay = Math.floor(86400 / 2);
          const perBlockReward = blocksInDay > 0 ? configValue / blocksInDay : 0;
          rewardAmount = perBlockReward * totalBlocks;
        } else {
          throw new Error(
            `Dynamic reward mode not supported in report script`
          );
        }

        console.log(
          `  Running minter w=${w} ${rewardToken}/${cType} reward=${rewardAmount.toFixed(2)}...`
        );
        const strategy = new MinterStrategy(
          cType,
          minterProvider,
          cfg.MINTER_GEB_SUBGRAPH_URL
        );
        const result = await calculateStrategyRewardsDetailed(
          strategy,
          { startBlock, endBlock },
          rewardAmount,
          minterProvider
        );
        const diffs = diffSnapshots(result.dailySnapshots);
        entries.push({ strategy: "minter", token: rewardToken, ...diffs });
      }
    }
  }

  // ── LP Staking (multi-window, multi-type) ──
  if (cfg.rewards.lpStaking.windows.length > 0) {
    const { lpStakingProvider } = await import("../utils/chain");
    let lpStakingLatestBlock: number | undefined;

    for (let w = 0; w < cfg.rewards.lpStaking.windows.length; w++) {
      const window = cfg.rewards.lpStaking.windows[w];
      if (!lpStakingLatestBlock && !window.endBlock) {
        lpStakingLatestBlock = await lpStakingProvider.getBlockNumber();
      }
      const effectiveEndBlock =
        window.endBlock ?? cfg.LP_STAKING_END_BLOCK ?? lpStakingLatestBlock!;
      const rewardTokens = Object.keys(window.config);

      for (const rewardToken of rewardTokens) {
        const stakingTypes = Object.keys(
          window.config[rewardToken] || {}
        ) as LpStakingType[];

        for (const stakingType of stakingTypes) {
          const startBlock = window.startBlock;
          const endBlock = effectiveEndBlock;
          const dailyRewardAmount =
            window.config[rewardToken][stakingType] ?? 0;
          const totalBlocks = endBlock - startBlock;
          const blocksInDay = Math.floor(86400 / 2);
          const perBlockReward =
            blocksInDay > 0 ? dailyRewardAmount / blocksInDay : 0;
          const rewardAmount = perBlockReward * totalBlocks;

          console.log(
            `  Running lpStaking w=${w} ${rewardToken}/${stakingType} reward=${rewardAmount.toFixed(2)}...`
          );
          const strategy = new LpStakingStrategy(
            stakingType,
            lpStakingProvider
          );
          const result = await calculateStrategyRewardsDetailed(
            strategy,
            { startBlock, endBlock },
            rewardAmount,
            lpStakingProvider
          );
          const diffs = diffSnapshots(result.dailySnapshots);
          entries.push({
            strategy: "lpStaking",
            token: rewardToken,
            ...diffs,
          });
        }
      }
    }
  }

  return entries;
}

// ── Position snapshots (same as verify-positions-report) ───────────────

async function getMinterPositionsAtBlock(
  block: number
): Promise<Map<string, MinterPosition>> {
  const cfg = config();
  const query = `
    {
      safes(where: { debt_gt: 0 }, first: 1000, skip: [[skip]], block: { number: ${block} }) {
        debt
        safeHandler
        collateralType { id }
      }
    }
  `;
  try {
    const safes = await subgraphQueryPaginated(
      query,
      "safes",
      cfg.MINTER_GEB_SUBGRAPH_URL
    );
    const owners = await getSafeOwnerMapping(block);
    const positions = new Map<string, MinterPosition>();
    for (const safe of safes) {
      const owner = owners.get(safe.safeHandler);
      if (owner) {
        const addr = owner.toLowerCase();
        const debt = Number(safe.debt);
        const cType = safe.collateralType?.id || "UNKNOWN";
        const existing = positions.get(addr) || {
          totalDebt: 0,
          byCollateral: {},
        };
        existing.totalDebt += debt;
        existing.byCollateral[cType] =
          (existing.byCollateral[cType] || 0) + debt;
        positions.set(addr, existing);
      }
    }
    return positions;
  } catch (err: any) {
    console.warn(`  Warning: minter positions at block ${block}:`, err.message);
    return new Map();
  }
}

async function getHaiveloPositionsAtBlock(
  endBlock: number
): Promise<Map<string, number>> {
  try {
    const events = await getRawHaiveloCollateralData();
    const filtered = events.filter(
      (e) => Number(e.createdAtBlock) <= endBlock
    );
    const users = processHaiveloCollateral(filtered);
    const positions = new Map<string, number>();
    for (const [addr, user] of Object.entries(users)) {
      if (user.collateral > 0)
        positions.set(addr.toLowerCase(), user.collateral);
    }
    return positions;
  } catch (err: any) {
    console.warn(`  Warning: haiVELO positions:`, err.message);
    return new Map();
  }
}

async function getHaiaeroPositionsAtBlock(
  endBlock: number
): Promise<Map<string, number>> {
  try {
    const events = await getRawHaiaeroCollateralData();
    const filtered = events.filter(
      (e) => Number(e.createdAtBlock) <= endBlock
    );
    const users = processHaiaeroCollateral(filtered);
    const positions = new Map<string, number>();
    for (const [addr, user] of Object.entries(users)) {
      if (user.collateral > 0)
        positions.set(addr.toLowerCase(), user.collateral);
    }
    return positions;
  } catch (err: any) {
    console.warn(`  Warning: haiAERO positions:`, err.message);
    return new Map();
  }
}

async function getLpStakingPositionsAtBlock(
  endBlock: number
): Promise<Map<string, Record<string, number>>> {
  const { lpStakingProvider } = await import("../utils/chain");
  const endTimestamp = (await lpStakingProvider.getBlock(endBlock)).timestamp;
  const stakingTypes: LpStakingType[] = ["HAI_BOLD_CURVE", "HAI_VELO_VELO"];
  const result = new Map<string, Record<string, number>>();
  for (const stakingType of stakingTypes) {
    try {
      const positions = await getLpStakingPositions(stakingType);
      const state = calculateLpStakingAtTimestamp(positions, endTimestamp);
      for (const [addr, data] of Object.entries(state.users)) {
        const existing = result.get(addr.toLowerCase()) || {};
        existing[stakingType] = Number(data.amount) / 1e18;
        result.set(addr.toLowerCase(), existing);
      }
    } catch (err: any) {
      console.warn(`  Warning: ${stakingType} positions:`, err.message);
    }
  }
  return result;
}

async function getLpPositionsAtBlock(
  block: number
): Promise<Map<string, number>> {
  try {
    const cfg = config();
    const query = buildLpPositionsQuery(block, cfg.UNISWAP_POOL_ADDRESS);
    const rawPositions = await fetchLpPositions(
      query,
      cfg.UNISWAP_SUBGRAPH_URL
    );
    const positions = new Map<string, number>();
    for (const pos of rawPositions) {
      const liquidity = parseInt(pos.liquidity, 10);
      if (liquidity > 0) {
        const addr = pos.owner.toLowerCase();
        positions.set(addr, (positions.get(addr) || 0) + liquidity);
      }
    }
    return positions;
  } catch (err: any) {
    console.warn(`  Warning: LP positions:`, err.message);
    return new Map();
  }
}

async function getKiteStakingState(
  endBlock: number
): Promise<Map<string, { amount: number; share: number }>> {
  const kite = new Map<string, { amount: number; share: number }>();
  try {
    const { haiveloProvider } = await import("../utils/chain");
    const endTimestamp = (await haiveloProvider.getBlock(endBlock)).timestamp;
    const stakingPositions = await getStakingPositions();
    const stakingState = calculateStakingAtTimestamp(
      stakingPositions,
      endTimestamp
    );
    for (const [addr, data] of Object.entries(stakingState.users) as [
      string,
      any,
    ][]) {
      kite.set(addr.toLowerCase(), {
        amount: Number(data.amount) / 1e18,
        share: data.share,
      });
    }
  } catch (err: any) {
    console.warn(`  Warning: KITE staking state:`, err.message);
  }
  return kite;
}

// ── Boost computation ──────────────────────────────────────────────────

interface PositionMaps {
  minter: Map<string, MinterPosition>;
  haivelo: Map<string, number>;
  haiaero: Map<string, number>;
  lpStaking: Map<string, Record<string, number>>;
  lp: Map<string, number>;
  kite: Map<string, { amount: number; share: number }>;
}

interface Totals {
  minterDebt: number;
  haiveloCollateral: number;
  haiaeroCollateral: number;
  lpStaking: Record<string, number>;
  lpLiquidity: number;
}

function computeTotals(positions: PositionMaps): Totals {
  let minterDebt = 0;
  for (const [, pos] of positions.minter) minterDebt += pos.totalDebt;
  let haiveloCollateral = 0;
  for (const [, col] of positions.haivelo) haiveloCollateral += col;
  let haiaeroCollateral = 0;
  for (const [, col] of positions.haiaero) haiaeroCollateral += col;
  const lpStaking: Record<string, number> = {};
  for (const [, stakes] of positions.lpStaking) {
    for (const [type, amount] of Object.entries(stakes)) {
      lpStaking[type] = (lpStaking[type] || 0) + amount;
    }
  }
  let lpLiquidity = 0;
  for (const [, liq] of positions.lp) lpLiquidity += liq;
  return {
    minterDebt,
    haiveloCollateral,
    haiaeroCollateral,
    lpStaking,
    lpLiquidity,
  };
}

function computeBoosts(
  address: string,
  positions: PositionMaps,
  totals: Totals
): Record<string, number> {
  const boosts: Record<string, number> = {};
  const minterDebt = positions.minter.get(address)?.totalDebt || 0;
  const haiveloCol = positions.haivelo.get(address) || 0;
  const haiaeroCol = positions.haiaero.get(address) || 0;
  const lpStaking = positions.lpStaking.get(address) || {};
  const lpLiquidity = positions.lp.get(address) || 0;
  const kiteShare = positions.kite.get(address)?.share || 0;

  if (minterDebt > 0 && totals.minterDebt > 0) {
    boosts.minter = Math.min(minterDebt / totals.minterDebt + 1, 2);
  }
  if (haiveloCol > 0 && totals.haiveloCollateral > 0 && kiteShare > 0) {
    boosts.haivelo = Math.min(
      kiteShare / (haiveloCol / totals.haiveloCollateral) + 1,
      2
    );
  }
  if (haiaeroCol > 0 && totals.haiaeroCollateral > 0 && kiteShare > 0) {
    boosts.haiaero = Math.min(
      kiteShare / (haiaeroCol / totals.haiaeroCollateral) + 1,
      2
    );
  }
  for (const [type, amount] of Object.entries(lpStaking)) {
    const total = totals.lpStaking[type] || 0;
    if (amount > 0 && total > 0 && kiteShare > 0) {
      boosts[`lpStaking_${type}`] = Math.min(
        kiteShare / (amount / total) + 1,
        2
      );
    }
  }
  if (lpLiquidity > 0 && totals.lpLiquidity > 0 && kiteShare > 0) {
    boosts.lp = Math.min(
      kiteShare / (lpLiquidity / totals.lpLiquidity) + 1,
      2
    );
  }
  return boosts;
}

// ── Aggregate strategy entries into daily reports ──────────────────────

function buildDailyReports(
  entries: StrategyDailyEntry[],
  filterDays: number,
  positions: PositionMaps,
  totals: Totals
): DailyReport[] {
  // Collect all day timestamps across all entries
  const allDays = new Set<number>();
  for (const entry of entries) {
    for (const day of entry.dailyEarned.keys()) {
      allDays.add(day);
    }
  }

  // Sort descending (most recent first) and take only the last N days
  const sortedDays = Array.from(allDays).sort((a, b) => b - a);
  const selectedDays = sortedDays.slice(0, filterDays);

  const reports: DailyReport[] = [];

  for (const dayTs of selectedDays) {
    const strategyTotals: DailyReport["strategyTotals"] = [];
    const totalRewardByToken: Record<string, number> = {};

    // Aggregate per-user data across all strategy entries for this day
    const userEarnedByToken: Record<string, Record<string, number>> = {};
    const userStrategyEarned: Record<
      string,
      Record<string, Record<string, number>>
    > = {};
    const userStrategyShare: Record<
      string,
      Record<string, Record<string, number>>
    > = {};
    const userStrategyPositions: Record<
      string,
      Record<string, Record<string, StrategyPositionData>>
    > = {};

    for (const entry of entries) {
      // haiVELO and haiAERO rewards are based on positions from ~7 days ago.
      // Shift their data forward so it appears on the day the user receives it.
      const DELAY_SECONDS = 7 * 86400; // 7 days
      const isDelayedStrategy = entry.strategy === 'haiVELO' ||
        entry.strategy === 'haiVELO-historical' ||
        entry.strategy === 'haiAERO';
      const lookupTs = isDelayedStrategy ? dayTs - DELAY_SECONDS : dayTs;

      const dayEarned = entry.dailyEarned.get(lookupTs);
      const dayTotal = entry.dailyTotal.get(lookupTs) || 0;
      if (!dayEarned || dayTotal <= 0) continue;

      strategyTotals.push({
        strategy: entry.strategy,
        token: entry.token,
        totalReward: dayTotal,
      });
      totalRewardByToken[entry.token] =
        (totalRewardByToken[entry.token] || 0) + dayTotal;

      // Weight data for this day (from the position day, not the reward day)
      const dayWeights = entry.dailyWeights.get(lookupTs);
      const dayBoosts = entry.dailyBoosts.get(lookupTs);
      const dayTotalW = entry.dailyTotalWeight.get(lookupTs) || 0;
      const dayTotalUW = entry.dailyTotalUnboostedWeight.get(lookupTs) || 0;

      for (const [addr, earned] of dayEarned) {
        // By token
        if (!userEarnedByToken[addr]) userEarnedByToken[addr] = {};
        userEarnedByToken[addr][entry.token] =
          (userEarnedByToken[addr][entry.token] || 0) + earned;

        // By strategy
        if (!userStrategyEarned[addr]) userStrategyEarned[addr] = {};
        if (!userStrategyEarned[addr][entry.strategy])
          userStrategyEarned[addr][entry.strategy] = {};
        userStrategyEarned[addr][entry.strategy][entry.token] =
          (userStrategyEarned[addr][entry.strategy][entry.token] || 0) +
          earned;

        // Share
        if (!userStrategyShare[addr]) userStrategyShare[addr] = {};
        if (!userStrategyShare[addr][entry.strategy])
          userStrategyShare[addr][entry.strategy] = {};
        userStrategyShare[addr][entry.strategy][entry.token] =
          dayTotal > 0 ? earned / dayTotal : 0;

        // Position data from snapshot
        if (dayBoosts) {
          const b = dayBoosts.get(addr) || 1;
          const eodWeights = entry.dailyEodWeights.get(lookupTs);
          const endW = eodWeights?.get(addr) || 0;
          const avgPositions = entry.dailyAvgPositions.get(lookupTs);
          const avgPos = avgPositions?.get(addr) || 0;
          const avgTotalPos = entry.dailyAvgTotalPosition.get(lookupTs) || 0;

          if (!userStrategyPositions[addr]) userStrategyPositions[addr] = {};
          if (!userStrategyPositions[addr][entry.strategy])
            userStrategyPositions[addr][entry.strategy] = {};

          const existing = userStrategyPositions[addr][entry.strategy][entry.token];
          if (existing) {
            // Sum across sub-entries (e.g. minter collateral types)
            existing.endOfDayWeight += endW;
            existing.avgPosition += avgPos;
            existing.avgTotalPosition += avgTotalPos;
            existing.endOfDayBoost = Math.max(existing.endOfDayBoost, b);
          } else {
            userStrategyPositions[addr][entry.strategy][entry.token] = {
              avgWeight: 0,        // computed after loop from earned
              avgUnboostedWeight: 0,
              avgTotalWeight: 0,
              avgTotalUnboostedWeight: 0,
              avgPosition: avgPos,
              avgTotalPosition: avgTotalPos,
              endOfDayWeight: endW,
              endOfDayBoost: b,
              isDelayed: isDelayedStrategy,
            };
          }
        }
      }
    }

    // Compute avgWeight from earned-based share. For multi-sub-entry strategies,
    // the distributor weights can't be combined, so we derive from earned amounts.
    //
    // Boosted weight: proportional to earned (since earned ∝ weight * boost)
    // Unboosted weight: earned / boost (removing the boost effect)
    // Total unboosted: sum across ALL users of (earned / boost)

    // First, compute total unboosted weight per strategy+token across all users
    const stratTotalUnboosted: Record<string, Record<string, number>> = {};
    for (const [addr, stratMap] of Object.entries(userStrategyEarned)) {
      for (const [strat, tokenMap] of Object.entries(stratMap)) {
        for (const [token, earned] of Object.entries(tokenMap)) {
          if (earned <= 0) continue;
          const boost = userStrategyPositions[addr]?.[strat]?.[token]?.endOfDayBoost || 1;
          if (!stratTotalUnboosted[strat]) stratTotalUnboosted[strat] = {};
          stratTotalUnboosted[strat][token] =
            (stratTotalUnboosted[strat][token] || 0) + earned / boost;
        }
      }
    }

    // Now set per-user position data
    for (const [addr, stratMap] of Object.entries(userStrategyPositions)) {
      for (const [strat, tokenMap] of Object.entries(stratMap)) {
        for (const [token, pos] of Object.entries(tokenMap)) {
          const userEarned = userStrategyEarned[addr]?.[strat]?.[token] || 0;
          let stratPool = 0;
          for (const st of strategyTotals) {
            if (st.strategy === strat && st.token === token) stratPool += st.totalReward;
          }
          if (stratPool > 0 && userEarned > 0) {
            pos.avgWeight = userEarned;
            pos.avgTotalWeight = stratPool;
            pos.avgUnboostedWeight = pos.endOfDayBoost > 0
              ? userEarned / pos.endOfDayBoost : userEarned;
            pos.avgTotalUnboostedWeight =
              stratTotalUnboosted[strat]?.[token] || stratPool;
          }
        }
      }
    }

    // Build user data with positions/boosts
    const users: Record<string, DailyUserData> = {};
    let totalBoostedPositions = 0;
    const allAddresses = new Set(Object.keys(userEarnedByToken));

    for (const addr of allAddresses) {
      const kiteData = positions.kite.get(addr);
      const boosts = computeBoosts(addr, positions, totals);
      const hasBoostedPosition = Object.values(boosts).some((b) => b > 1);
      if (hasBoostedPosition) totalBoostedPositions++;

      users[addr] = {
        dailyEarned: userEarnedByToken[addr] || {},
        dailyStrategyEarned: userStrategyEarned[addr] || {},
        dailyStrategyShare: userStrategyShare[addr] || {},
        strategyPositions: userStrategyPositions[addr] || {},
        kiteStaked: kiteData?.amount || 0,
        kiteShare: kiteData?.share || 0,
        boosts,
        hasBoostedPosition,
      };
    }

    reports.push({
      dayTimestamp: dayTs,
      date: new Date(dayTs * 1000).toISOString().split("T")[0],
      strategyTotals,
      totalRewardByToken,
      totalBoostedPositions,
      users,
    });
  }

  // Sort chronologically (oldest first)
  reports.sort((a, b) => a.dayTimestamp - b.dayTimestamp);
  return reports;
}

// ── Averaging ──────────────────────────────────────────────────────────

function computeAverages(reports: DailyReport[]): {
  globalAverages: ReportOutput["globalAverages"];
  users: UserAverage[];
} {
  const n = reports.length;
  if (n === 0) {
    return {
      globalAverages: {
        avgDailyRewardByToken: {},
        avgBoostedPositions: 0,
        avgDailyStrategyTotals: [],
      },
      users: [],
    };
  }

  const tokenSums: Record<string, number> = {};
  let boostedSum = 0;
  const stratSums: Record<string, number> = {};

  const userDayCount = new Map<string, number>();
  const userEarnedSums = new Map<string, Record<string, number>>();
  const userStrategySums = new Map<
    string,
    Record<string, Record<string, number>>
  >();
  const userStrategyShareSums = new Map<
    string,
    Record<string, Record<string, number>>
  >();
  const userKiteStakedSum = new Map<string, number>();
  const userKiteShareSum = new Map<string, number>();
  const userBoostSums = new Map<string, Record<string, number>>();

  for (const report of reports) {
    for (const [token, total] of Object.entries(report.totalRewardByToken)) {
      tokenSums[token] = (tokenSums[token] || 0) + total;
    }
    boostedSum += report.totalBoostedPositions;
    for (const st of report.strategyTotals) {
      const key = `${st.strategy}|${st.token}`;
      stratSums[key] = (stratSums[key] || 0) + st.totalReward;
    }

    for (const [addr, data] of Object.entries(report.users)) {
      userDayCount.set(addr, (userDayCount.get(addr) || 0) + 1);

      const earnedAcc = userEarnedSums.get(addr) || {};
      for (const [token, val] of Object.entries(data.dailyEarned)) {
        earnedAcc[token] = (earnedAcc[token] || 0) + val;
      }
      userEarnedSums.set(addr, earnedAcc);

      const stratAcc = userStrategySums.get(addr) || {};
      for (const [strat, tokens] of Object.entries(
        data.dailyStrategyEarned
      )) {
        if (!stratAcc[strat]) stratAcc[strat] = {};
        for (const [token, val] of Object.entries(tokens)) {
          stratAcc[strat][token] = (stratAcc[strat][token] || 0) + val;
        }
      }
      userStrategySums.set(addr, stratAcc);

      const shareAcc = userStrategyShareSums.get(addr) || {};
      for (const [strat, tokens] of Object.entries(
        data.dailyStrategyShare
      )) {
        if (!shareAcc[strat]) shareAcc[strat] = {};
        for (const [token, val] of Object.entries(tokens)) {
          shareAcc[strat][token] = (shareAcc[strat][token] || 0) + val;
        }
      }
      userStrategyShareSums.set(addr, shareAcc);

      userKiteStakedSum.set(
        addr,
        (userKiteStakedSum.get(addr) || 0) + data.kiteStaked
      );
      userKiteShareSum.set(
        addr,
        (userKiteShareSum.get(addr) || 0) + data.kiteShare
      );

      const boostAcc = userBoostSums.get(addr) || {};
      for (const [strat, val] of Object.entries(data.boosts)) {
        boostAcc[strat] = (boostAcc[strat] || 0) + val;
      }
      userBoostSums.set(addr, boostAcc);
    }
  }

  const avgDailyRewardByToken: Record<string, number> = {};
  for (const [token, sum] of Object.entries(tokenSums)) {
    avgDailyRewardByToken[token] = sum / n;
  }

  const avgDailyStrategyTotals = Object.entries(stratSums).map(
    ([key, sum]) => {
      const [strategy, token] = key.split("|");
      return { strategy, token, avgDailyTotal: sum / n };
    }
  );

  const users: UserAverage[] = [];
  for (const [addr, days] of userDayCount) {
    const avgDailyEarnedByToken: Record<string, number> = {};
    for (const [token, sum] of Object.entries(
      userEarnedSums.get(addr) || {}
    )) {
      avgDailyEarnedByToken[token] = sum / days;
    }

    const avgDailyStrategyEarned: Record<string, Record<string, number>> = {};
    for (const [strat, tokens] of Object.entries(
      userStrategySums.get(addr) || {}
    )) {
      avgDailyStrategyEarned[strat] = {};
      for (const [token, sum] of Object.entries(tokens)) {
        avgDailyStrategyEarned[strat][token] = sum / days;
      }
    }

    const avgDailyStrategyShare: Record<string, Record<string, number>> = {};
    for (const [strat, tokens] of Object.entries(
      userStrategyShareSums.get(addr) || {}
    )) {
      avgDailyStrategyShare[strat] = {};
      for (const [token, sum] of Object.entries(tokens)) {
        avgDailyStrategyShare[strat][token] = sum / days;
      }
    }

    const avgBoosts: Record<string, number> = {};
    for (const [strat, sum] of Object.entries(
      userBoostSums.get(addr) || {}
    )) {
      avgBoosts[strat] = sum / days;
    }

    users.push({
      address: addr,
      avgDailyEarnedByToken,
      avgDailyStrategyEarned,
      avgDailyStrategyShare,
      avgKiteStaked: (userKiteStakedSum.get(addr) || 0) / days,
      avgKiteShare: (userKiteShareSum.get(addr) || 0) / days,
      avgBoosts,
      daysActive: days,
    });
  }

  users.sort((a, b) => {
    const aTotal = Object.values(a.avgDailyEarnedByToken).reduce(
      (s, v) => s + v,
      0
    );
    const bTotal = Object.values(b.avgDailyEarnedByToken).reduce(
      (s, v) => s + v,
      0
    );
    return bTotal - aTotal;
  });

  return {
    globalAverages: {
      avgDailyRewardByToken,
      avgBoostedPositions: boostedSum / n,
      avgDailyStrategyTotals,
    },
    users,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

async function generateDailyReport(): Promise<void> {
  const numDays = parseDaysArg();

  console.log("=".repeat(60));
  console.log(`  DAILY REWARD REPORT — ${numDays}-DAY BREAKDOWN`);
  console.log("=".repeat(60));
  console.log(`  Generated: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  // 1. Run all strategies once, collecting daily snapshots
  console.log("\n  Running all reward strategies...\n");
  const strategyEntries = await runAllStrategiesWithSnapshots();
  console.log(
    `\n  Collected ${strategyEntries.length} strategy entries with daily snapshots.`
  );

  // 2. Fetch current positions for boost/kite data
  console.log("\n  Fetching current positions...");
  const { minterProvider, haiveloProvider, lpStakingProvider } = await import(
    "../utils/chain"
  );
  const [minterBlock, haiveloBlock, lpStakingBlock] = await Promise.all([
    minterProvider.getBlockNumber().then((b: number) => b - 30),
    haiveloProvider.getBlockNumber().then((b: number) => b - 30),
    lpStakingProvider.getBlockNumber().then((b: number) => b - 30),
  ]);

  const [minter, haivelo, haiaero, lpStaking, lp, kite] = await Promise.all([
    getMinterPositionsAtBlock(minterBlock),
    getHaiveloPositionsAtBlock(haiveloBlock),
    getHaiaeroPositionsAtBlock(haiveloBlock),
    getLpStakingPositionsAtBlock(lpStakingBlock),
    getLpPositionsAtBlock(haiveloBlock),
    getKiteStakingState(haiveloBlock),
  ]);

  const positions: PositionMaps = {
    minter,
    haivelo,
    haiaero,
    lpStaking,
    lp,
    kite,
  };
  const totals = computeTotals(positions);

  console.log(
    `  Positions: minter=${minter.size} haivelo=${haivelo.size} haiaero=${haiaero.size} lpStaking=${lpStaking.size} lp=${lp.size} kite=${kite.size}`
  );

  // 3. Build daily reports from snapshots
  console.log("\n  Building daily reports...");
  const dailyReports = buildDailyReports(
    strategyEntries,
    numDays,
    positions,
    totals
  );
  console.log(`  Generated ${dailyReports.length} daily reports.`);

  // 4. Compute averages
  console.log("\n  Computing averages...");
  const { globalAverages, users } = computeAverages(dailyReports);

  console.log(`  Total unique users: ${users.length}`);
  console.log(
    `  Avg boosted positions: ${globalAverages.avgBoostedPositions.toFixed(1)}`
  );
  console.log(`  Avg daily rewards by token:`);
  for (const [token, avg] of Object.entries(
    globalAverages.avgDailyRewardByToken
  )) {
    console.log(`    ${token}: ${avg.toFixed(4)}`);
  }

  // 5. Write report
  const reportData: ReportOutput = {
    generatedAt: new Date().toISOString(),
    periodDays: numDays,
    totalDaysWithData: dailyReports.length,
    globalAverages,
    dailyReports,
    users,
  };

  const reportDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportFile = path.join(
    reportDir,
    `daily-reward-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
  console.log(`\nReport saved to: ${reportFile}`);

  // Also save as latest report for the API to serve
  const latestFile = path.join(reportDir, "latest-report.json");
  fs.copyFileSync(reportFile, latestFile);
  console.log(`Latest report updated: ${latestFile}`);
}

// ── Entry point ────────────────────────────────────────────────────────

generateDailyReport()
  .then(() => {
    console.log("\nReport generation complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Report generation failed:", err);
    process.exit(1);
  });
