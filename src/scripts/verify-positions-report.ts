/**
 * Position Verification Report — 2-Day Dry Run
 *
 * Simulates 2 consecutive daily reward runs (no on-chain update), subtracts
 * already-claimed values, then cross-references every rewarded user against
 * their position state at each run's end block.
 *
 * Run 1: start blocks → yesterday's block
 * Run 2: start blocks → current block (now)
 *
 * Usage:
 *   yarn verify-positions
 *
 * Environment:
 *   Requires the same .env as the main reward distribution pipeline.
 */

import { config as dotenv } from "dotenv";
dotenv();

import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { config } from "../config";
import { subgraphQuery, subgraphQueryPaginated } from "../services/subgraph/utils";
import { combineResults, RewardsMap } from "../modules/result-combiner";
import { getTokenAddressMap } from "../modules/orchestrator/contractHelpers";
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
import { LpStakingType } from "../config/types";
import {
  buildLpPositionsQuery,
  fetchLpPositions,
} from "../services/initial-data/getInitialLpPosition";
import {
  getStakingPositions,
  calculateStakingAtTimestamp,
} from "../services/skite-data";

// ── Constants ──────────────────────────────────────────────────────────

const BLOCKS_PER_DAY = Math.floor(86400 / 2); // 2s block time
const DUST_THRESHOLD = ethers.BigNumber.from(10).pow(16); // 0.01 tokens

// ── Types ──────────────────────────────────────────────────────────────

interface MinterPosition {
  totalDebt: number;
  byCollateral: Record<string, number>;
}

interface DetailedPositions {
  minter?: MinterPosition;
  haivelo?: { collateral: number };
  haiaero?: { collateral: number };
  lpStaking?: Record<string, number>;
  lp?: { liquidity: number };
  kiteStaked?: number;
  kiteShare?: number;
  boosts?: Record<string, number>;
}

interface RunResult {
  label: string;
  endBlocks: { minter: number; haivelo: number; lpStaking: number };
  /** Rewards per token per user AFTER subtracting claims, filtering dust */
  rewards: { [token: string]: { address: string; earned: string }[] };
  /** Position state snapshot at endBlock */
  positions: {
    minter: Map<string, MinterPosition>;
    haivelo: Map<string, number>;
    haiaero: Map<string, number>;
    lpStaking: Map<string, Record<string, number>>;
    lp: Map<string, number>;
    kite: Map<string, { amount: number; share: number }>;
  };
  /** Totals for boost computation */
  totals: {
    minterDebt: number;
    haiveloCollateral: number;
    haiaeroCollateral: number;
    lpStaking: Record<string, number>;
    lpLiquidity: number;
  };
}

interface UserRow {
  address: string;
  run1Rewards: Record<string, string>;
  run2Rewards: Record<string, string>;
  run1Positions: Record<string, string>;
  run2Positions: Record<string, string>;
  run1DetailedPositions?: DetailedPositions;
  run2DetailedPositions?: DetailedPositions;
  run1HasPosition: boolean;
  run2HasPosition: boolean;
}

// ── Block helpers ──────────────────────────────────────────────────────

async function getEndBlocks(delay: number = 30) {
  const { minterProvider, haiveloProvider, lpStakingProvider } = await import("../utils/chain");

  const [minterBlock, haiveloBlock, lpStakingBlock] = await Promise.all([
    minterProvider.getBlockNumber(),
    haiveloProvider.getBlockNumber(),
    lpStakingProvider.getBlockNumber(),
  ]);

  return {
    minter: minterBlock - delay,
    haivelo: haiveloBlock - delay,
    lpStaking: lpStakingBlock - delay,
  };
}

// ── Claimed amounts (same logic as CalculateRewardsStep) ───────────────

async function getClaimedAmounts(
  token: string,
  users: string[]
): Promise<Map<string, string>> {
  if (users.length === 0) return new Map();

  const query = `
    {
      tokenClaims(where: {
        token: "${token.toLowerCase()}"
        user_in: ${JSON.stringify(users.map((u) => u?.toLowerCase()))}
      }) {
        user { id }
        totalAmount
      }
    }
  `;

  try {
    const response = await subgraphQuery(query, config().DISTRIBUTOR_SUBGRAPH_URL);
    return new Map(
      response.tokenClaims.map((claim: any) => [
        claim.user.id.toLowerCase(),
        claim.totalAmount,
      ])
    );
  } catch (error) {
    console.error(`Error fetching claimed amounts for token ${token}:`, error);
    return new Map();
  }
}

async function subtractClaims(
  rawRewards: RewardsMap
): Promise<{ [token: string]: { address: string; earned: string }[] }> {
  const tokenAddressMap = getTokenAddressMap();
  const finalResults: { [token: string]: { address: string; earned: string }[] } = {};

  for (const [token, rewards] of Object.entries(rawRewards)) {
    const tokenAddress = tokenAddressMap[token.toUpperCase() as keyof typeof tokenAddressMap];
    if (!tokenAddress) {
      console.warn(`  No address found for token: ${token}, skipping claims`);
      continue;
    }

    // Convert to BigNumber
    const bnRewards = rewards.map((r) => ({
      address: r.address,
      earned: ethers.utils.parseEther(r.earned.toFixed(18)).toString(),
    }));

    const claimedAmounts = await getClaimedAmounts(
      tokenAddress,
      bnRewards.map((r) => r.address)
    );

    finalResults[token] = bnRewards
      .map((reward) => {
        const claimed = claimedAmounts.get(reward.address.toLowerCase()) || "0";
        const remaining = ethers.BigNumber.from(reward.earned).sub(
          ethers.BigNumber.from(claimed)
        );
        const isDusty = remaining.lte(DUST_THRESHOLD);
        return {
          address: reward.address,
          earned: isDusty ? "0" : remaining.toString(),
        };
      })
      .filter((r) => r.earned !== "0");

    console.log(`  ${token}: ${finalResults[token].length} users after claims subtracted (${claimedAmounts.size} claims found)`);
  }

  return finalResults;
}

// ── Position snapshots ─────────────────────────────────────────────────

async function getMinterPositionsAtBlock(block: number): Promise<Map<string, MinterPosition>> {
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
    const safes = await subgraphQueryPaginated(query, "safes", cfg.MINTER_GEB_SUBGRAPH_URL);
    const owners = await getSafeOwnerMapping(block);

    const positions = new Map<string, MinterPosition>();
    for (const safe of safes) {
      const owner = owners.get(safe.safeHandler);
      if (owner) {
        const addr = owner.toLowerCase();
        const debt = Number(safe.debt);
        const cType = safe.collateralType?.id || "UNKNOWN";

        const existing = positions.get(addr) || { totalDebt: 0, byCollateral: {} };
        existing.totalDebt += debt;
        existing.byCollateral[cType] = (existing.byCollateral[cType] || 0) + debt;
        positions.set(addr, existing);
      }
    }
    return positions;
  } catch (err: any) {
    console.warn(`  Warning: minter positions at block ${block}:`, err.message);
    return new Map();
  }
}

async function getHaiveloPositionsAtBlock(endBlock: number): Promise<Map<string, number>> {
  try {
    const events = await getRawHaiveloCollateralData();
    // Filter events up to endBlock
    const filtered = events.filter((e) => Number(e.createdAtBlock) <= endBlock);
    const users = processHaiveloCollateral(filtered);

    const positions = new Map<string, number>();
    for (const [addr, user] of Object.entries(users)) {
      if (user.collateral > 0) positions.set(addr.toLowerCase(), user.collateral);
    }
    return positions;
  } catch (err: any) {
    console.warn(`  Warning: haiVELO positions at block ${endBlock}:`, err.message);
    return new Map();
  }
}

async function getHaiaeroPositionsAtBlock(endBlock: number): Promise<Map<string, number>> {
  try {
    const events = await getRawHaiaeroCollateralData();
    const filtered = events.filter((e) => Number(e.createdAtBlock) <= endBlock);
    const users = processHaiaeroCollateral(filtered);

    const positions = new Map<string, number>();
    for (const [addr, user] of Object.entries(users)) {
      if (user.collateral > 0) positions.set(addr.toLowerCase(), user.collateral);
    }
    return positions;
  } catch (err: any) {
    console.warn(`  Warning: haiAERO positions at block ${endBlock}:`, err.message);
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
      console.warn(`  Warning: ${stakingType} positions at block ${endBlock}:`, err.message);
    }
  }

  return result;
}

async function getLpPositionsAtBlock(block: number): Promise<Map<string, number>> {
  try {
    const cfg = config();
    const query = buildLpPositionsQuery(block, cfg.UNISWAP_POOL_ADDRESS);
    const rawPositions = await fetchLpPositions(query, cfg.UNISWAP_SUBGRAPH_URL);

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
    console.warn(`  Warning: LP positions at block ${block}:`, err.message);
    return new Map();
  }
}

// ── Single run ─────────────────────────────────────────────────────────

async function executeRun(
  label: string,
  endBlocks: { minter: number; haivelo: number; lpStaking: number }
): Promise<RunResult> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`  End blocks: minter=${endBlocks.minter} haivelo=${endBlocks.haivelo} lpStaking=${endBlocks.lpStaking}`);
  console.log(`${"=".repeat(60)}\n`);

  // Set end block env vars so config() picks them up
  process.env.MINTER_END_BLOCK = String(endBlocks.minter);
  process.env.LP_STAKING_END_BLOCK = String(endBlocks.lpStaking);
  process.env.HAIVELO_END_BLOCK = String(endBlocks.haivelo);
  process.env.HAIAERO_END_BLOCK = String(endBlocks.haivelo); // same chain
  process.env.LP_END_BLOCK = String(endBlocks.haivelo);
  process.env.END_BLOCK = String(endBlocks.haivelo);

  // 1. Calculate rewards
  console.log("  Calculating rewards...");
  const rawRewards = await combineResults();
  console.log(`  Raw rewards calculated for tokens: ${Object.keys(rawRewards).join(", ")}`);

  // 2. Subtract claimed amounts
  console.log("  Subtracting claimed amounts...");
  const rewards = await subtractClaims(rawRewards);

  // 3. Snapshot positions at end block
  console.log("  Fetching position snapshots...");
  const [minter, haivelo, haiaero, lpStaking, lp] = await Promise.all([
    getMinterPositionsAtBlock(endBlocks.minter),
    getHaiveloPositionsAtBlock(endBlocks.haivelo),
    getHaiaeroPositionsAtBlock(endBlocks.haivelo),
    getLpStakingPositionsAtBlock(endBlocks.lpStaking),
    getLpPositionsAtBlock(endBlocks.haivelo),
  ]);

  // 4. Fetch KITE staking state
  console.log("  Fetching KITE staking state...");
  const kite = new Map<string, { amount: number; share: number }>();
  try {
    const { haiveloProvider } = await import("../utils/chain");
    const endTimestamp = (await haiveloProvider.getBlock(endBlocks.haivelo)).timestamp;
    const stakingPositions = await getStakingPositions();
    const stakingState = calculateStakingAtTimestamp(stakingPositions, endTimestamp);

    for (const [addr, data] of Object.entries(stakingState.users) as [string, any][]) {
      kite.set(addr.toLowerCase(), {
        amount: Number(data.amount) / 1e18,
        share: data.share,
      });
    }
  } catch (err: any) {
    console.warn(`  Warning: KITE staking state:`, err.message);
  }

  // 5. Compute totals for boost calculation
  let totalMinterDebt = 0;
  for (const [, pos] of minter) totalMinterDebt += pos.totalDebt;

  let totalHaiveloCollateral = 0;
  for (const [, col] of haivelo) totalHaiveloCollateral += col;

  let totalHaiaeroCollateral = 0;
  for (const [, col] of haiaero) totalHaiaeroCollateral += col;

  const totalLpStaking: Record<string, number> = {};
  for (const [, stakes] of lpStaking) {
    for (const [type, amount] of Object.entries(stakes)) {
      totalLpStaking[type] = (totalLpStaking[type] || 0) + amount;
    }
  }

  let totalLpLiquidity = 0;
  for (const [, liq] of lp) totalLpLiquidity += liq;

  console.log(`  Positions: minter=${minter.size} haivelo=${haivelo.size} haiaero=${haiaero.size} lpStaking=${lpStaking.size} lp=${lp.size} kite=${kite.size}`);

  return {
    label,
    endBlocks,
    rewards,
    positions: { minter, haivelo, haiaero, lpStaking, lp, kite },
    totals: {
      minterDebt: totalMinterDebt,
      haiveloCollateral: totalHaiveloCollateral,
      haiaeroCollateral: totalHaiaeroCollateral,
      lpStaking: totalLpStaking,
      lpLiquidity: totalLpLiquidity,
    },
  };
}

// ── Position summary helpers ───────────────────────────────────────────

function positionSummary(
  address: string,
  positions: RunResult["positions"],
  totals: RunResult["totals"]
): { text: Record<string, string>; hasAny: boolean; detailed: DetailedPositions } {
  const minterPos = positions.minter.get(address);
  const minterDebt = minterPos?.totalDebt || 0;
  const haiveloCol = positions.haivelo.get(address) || 0;
  const haiaeroCol = positions.haiaero.get(address) || 0;
  const lpStaking = positions.lpStaking.get(address) || {};
  const lpTotal = Object.values(lpStaking).reduce((s, v) => s + v, 0);
  const lpLiquidity = positions.lp.get(address) || 0;
  const kiteData = positions.kite.get(address);

  // Old flat format (backward compat)
  const text: Record<string, string> = {};
  if (minterDebt > 0) text["Minter Debt"] = minterDebt.toFixed(4);
  if (haiveloCol > 0) text["haiVELO Collateral"] = haiveloCol.toFixed(4);
  if (haiaeroCol > 0) text["haiAERO Collateral"] = haiaeroCol.toFixed(4);
  Object.entries(lpStaking).forEach(([k, v]) => {
    if (v > 0) text[`LP Staking (${k})`] = v.toFixed(4);
  });
  if (lpLiquidity > 0) text["Uniswap LP"] = lpLiquidity.toString();

  const hasAny = minterDebt > 0 || haiveloCol > 0 || haiaeroCol > 0 || lpTotal > 0 || lpLiquidity > 0;

  // New detailed format
  const detailed: DetailedPositions = {};

  if (minterPos && minterDebt > 0) {
    detailed.minter = minterPos;
  }
  if (haiveloCol > 0) detailed.haivelo = { collateral: haiveloCol };
  if (haiaeroCol > 0) detailed.haiaero = { collateral: haiaeroCol };
  if (lpTotal > 0) detailed.lpStaking = lpStaking;
  if (lpLiquidity > 0) detailed.lp = { liquidity: lpLiquidity };

  if (kiteData) {
    detailed.kiteStaked = kiteData.amount;
    detailed.kiteShare = kiteData.share;
  }

  // Compute boosts per strategy
  const boosts: Record<string, number> = {};
  const kiteShare = kiteData?.share || 0;

  if (minterDebt > 0 && totals.minterDebt > 0) {
    const debtShare = minterDebt / totals.minterDebt;
    boosts.minter = Math.min(debtShare + 1, 2);
  }
  if (haiveloCol > 0 && totals.haiveloCollateral > 0 && kiteShare > 0) {
    boosts.haivelo = Math.min(kiteShare / (haiveloCol / totals.haiveloCollateral) + 1, 2);
  }
  if (haiaeroCol > 0 && totals.haiaeroCollateral > 0 && kiteShare > 0) {
    boosts.haiaero = Math.min(kiteShare / (haiaeroCol / totals.haiaeroCollateral) + 1, 2);
  }
  for (const [type, amount] of Object.entries(lpStaking)) {
    const total = totals.lpStaking[type] || 0;
    if (amount > 0 && total > 0 && kiteShare > 0) {
      boosts[`lpStaking_${type}`] = Math.min(kiteShare / (amount / total) + 1, 2);
    }
  }
  if (lpLiquidity > 0 && totals.lpLiquidity > 0 && kiteShare > 0) {
    boosts.lp = Math.min(kiteShare / (lpLiquidity / totals.lpLiquidity) + 1, 2);
  }

  if (Object.keys(boosts).length > 0) {
    detailed.boosts = boosts;
  }

  return { text, hasAny, detailed };
}

function rewardSummary(
  address: string,
  rewards: RunResult["rewards"]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [token, userRewards] of Object.entries(rewards)) {
    const entry = userRewards.find((r) => r.address.toLowerCase() === address);
    if (entry) {
      result[token] = parseFloat(ethers.utils.formatEther(entry.earned)).toFixed(4);
    }
  }
  return result;
}

// ── Report generation ──────────────────────────────────────────────────

async function generateReport(): Promise<void> {
  console.log("=".repeat(60));
  console.log("  POSITION VERIFICATION REPORT — 2-DAY DRY RUN");
  console.log("=".repeat(60));
  console.log(`  Generated: ${new Date().toISOString()}`);
  console.log("  Mode: dry-run (no on-chain updates)");
  console.log("=".repeat(60));

  // Save original env vars to restore between runs
  const origEnv = {
    MINTER_END_BLOCK: process.env.MINTER_END_BLOCK,
    LP_STAKING_END_BLOCK: process.env.LP_STAKING_END_BLOCK,
    HAIVELO_END_BLOCK: process.env.HAIVELO_END_BLOCK,
    HAIAERO_END_BLOCK: process.env.HAIAERO_END_BLOCK,
    LP_END_BLOCK: process.env.LP_END_BLOCK,
    END_BLOCK: process.env.END_BLOCK,
  };

  // Get current (latest) end blocks
  console.log("\nFetching current block numbers...");
  const nowBlocks = await getEndBlocks();
  const yesterdayBlocks = {
    minter: nowBlocks.minter - BLOCKS_PER_DAY,
    haivelo: nowBlocks.haivelo - BLOCKS_PER_DAY,
    lpStaking: nowBlocks.lpStaking - BLOCKS_PER_DAY,
  };

  console.log(`  Now blocks:       minter=${nowBlocks.minter} haivelo=${nowBlocks.haivelo} lpStaking=${nowBlocks.lpStaking}`);
  console.log(`  Yesterday blocks: minter=${yesterdayBlocks.minter} haivelo=${yesterdayBlocks.haivelo} lpStaking=${yesterdayBlocks.lpStaking}`);

  // ── Run 1: start → yesterday ──
  const run1 = await executeRun("RUN 1: Start → Yesterday", yesterdayBlocks);

  // ── Run 2: start → now ──
  const run2 = await executeRun("RUN 2: Start → Now", nowBlocks);

  // Restore env
  Object.entries(origEnv).forEach(([k, v]) => {
    if (v !== undefined) process.env[k] = v;
    else delete process.env[k];
  });

  // ── Build combined user report ──
  console.log(`\n${"=".repeat(60)}`);
  console.log("  BUILDING COMBINED REPORT");
  console.log("=".repeat(60));

  // Collect all addresses from both runs
  const allAddresses = new Set<string>();
  [run1, run2].forEach((run) => {
    Object.values(run.rewards).forEach((tokenRewards) => {
      tokenRewards.forEach((r) => allAddresses.add(r.address.toLowerCase()));
    });
  });

  const rows: UserRow[] = [];
  let run1WithPos = 0, run1WithoutPos = 0;
  let run2WithPos = 0, run2WithoutPos = 0;

  Array.from(allAddresses).forEach((address) => {
    const r1Rewards = rewardSummary(address, run1.rewards);
    const r2Rewards = rewardSummary(address, run2.rewards);
    const r1Pos = positionSummary(address, run1.positions, run1.totals);
    const r2Pos = positionSummary(address, run2.positions, run2.totals);

    if (r1Pos.hasAny) run1WithPos++; else if (Object.keys(r1Rewards).length > 0) run1WithoutPos++;
    if (r2Pos.hasAny) run2WithPos++; else if (Object.keys(r2Rewards).length > 0) run2WithoutPos++;

    rows.push({
      address,
      run1Rewards: r1Rewards,
      run2Rewards: r2Rewards,
      run1Positions: r1Pos.text,
      run2Positions: r2Pos.text,
      run1DetailedPositions: r1Pos.detailed,
      run2DetailedPositions: r2Pos.detailed,
      run1HasPosition: r1Pos.hasAny,
      run2HasPosition: r2Pos.hasAny,
    });
  });

  // Sort: problems first
  rows.sort((a, b) => {
    const aOk = a.run1HasPosition && a.run2HasPosition;
    const bOk = b.run1HasPosition && b.run2HasPosition;
    if (aOk !== bOk) return aOk ? 1 : -1;
    return a.address.localeCompare(b.address);
  });

  // ── Print summary ──
  const totalUsers = allAddresses.size;
  console.log(`\n${"=".repeat(60)}`);
  console.log("  SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Total unique rewarded users:      ${totalUsers}`);
  console.log();
  console.log(`  Run 1 (Yesterday):`);
  console.log(`    End blocks:    minter=${yesterdayBlocks.minter} haivelo=${yesterdayBlocks.haivelo}`);
  console.log(`    With position:    ${run1WithPos}`);
  console.log(`    Without position: ${run1WithoutPos}`);
  console.log();
  console.log(`  Run 2 (Now):`);
  console.log(`    End blocks:    minter=${nowBlocks.minter} haivelo=${nowBlocks.haivelo}`);
  console.log(`    With position:    ${run2WithPos}`);
  console.log(`    Without position: ${run2WithoutPos}`);
  console.log("=".repeat(60));
  console.log();

  if (run1WithoutPos === 0 && run2WithoutPos === 0) {
    console.log("RESULT: ALL rewarded users have active positions in BOTH runs.\n");
  } else {
    console.log("WARNING: Some users received rewards without an active position:\n");
  }

  // ── Print detailed report ──
  console.log("=".repeat(60));
  console.log("  DETAILED USER REPORT");
  console.log("=".repeat(60));
  console.log();

  for (const row of rows) {
    const r1Ok = row.run1HasPosition || Object.keys(row.run1Rewards).length === 0;
    const r2Ok = row.run2HasPosition || Object.keys(row.run2Rewards).length === 0;
    const flag = r1Ok && r2Ok ? "OK" : "NO POSITION";

    console.log(`[${flag}] ${row.address}`);

    if (Object.keys(row.run1Rewards).length > 0) {
      console.log("  Run 1 (Yesterday):");
      console.log("    Rewards:");
      Object.entries(row.run1Rewards).forEach(([t, v]) => console.log(`      ${t}: ${v}`));
      if (Object.keys(row.run1Positions).length > 0) {
        console.log("    Positions:");
        Object.entries(row.run1Positions).forEach(([k, v]) => console.log(`      ${k}: ${v}`));
      } else {
        console.log("    Positions: NONE");
      }
    }

    if (Object.keys(row.run2Rewards).length > 0) {
      console.log("  Run 2 (Now):");
      console.log("    Rewards:");
      Object.entries(row.run2Rewards).forEach(([t, v]) => console.log(`      ${t}: ${v}`));
      if (Object.keys(row.run2Positions).length > 0) {
        console.log("    Positions:");
        Object.entries(row.run2Positions).forEach(([k, v]) => console.log(`      ${k}: ${v}`));
      } else {
        console.log("    Positions: NONE");
      }
    }

    // Show diff between runs
    const r2Only = Object.keys(row.run2Rewards).filter((t) => !row.run1Rewards[t]);
    const dropped = Object.keys(row.run1Rewards).filter((t) => !row.run2Rewards[t]);
    if (r2Only.length > 0) console.log(`  New tokens in Run 2: ${r2Only.join(", ")}`);
    if (dropped.length > 0) console.log(`  Tokens dropped in Run 2: ${dropped.join(", ")}`);

    console.log();
  }

  // ── Write JSON report ──
  const reportData = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run (no on-chain updates)",
    runs: [
      {
        label: run1.label,
        endBlocks: run1.endBlocks,
        tokenRewardCounts: Object.fromEntries(
          Object.entries(run1.rewards).map(([t, r]) => [t, r.length])
        ),
      },
      {
        label: run2.label,
        endBlocks: run2.endBlocks,
        tokenRewardCounts: Object.fromEntries(
          Object.entries(run2.rewards).map(([t, r]) => [t, r.length])
        ),
      },
    ],
    summary: {
      totalRewardedUsers: totalUsers,
      run1: { withPosition: run1WithPos, withoutPosition: run1WithoutPos },
      run2: { withPosition: run2WithPos, withoutPosition: run2WithoutPos },
    },
    users: rows,
  };

  const reportDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportFile = path.join(
    reportDir,
    `position-verification-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
  console.log(`JSON report saved to: ${reportFile}`);
}

// ── Entry point ────────────────────────────────────────────────────────

generateReport()
  .then(() => {
    console.log("\nReport generation complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Report generation failed:", err);
    process.exit(1);
  });
