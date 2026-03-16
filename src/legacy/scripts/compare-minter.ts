/**
 * Compare old vs new Minter reward calculators.
 *
 * Usage:
 *   npx ts-node src/scripts/compare-minter.ts
 */

import { config as dotenvConfig } from "dotenv";
import path from "path";
import fs from "fs";

dotenvConfig({ path: path.join(__dirname, "..", "..", ".env") });

const snapshotPath = path.join(
  __dirname,
  "..",
  "..",
  "golden-snapshots",
  "snapshot.json"
);
if (!fs.existsSync(snapshotPath)) {
  console.error("No golden snapshot found. Run `yarn golden:record` first.");
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
for (const [key, value] of Object.entries(snapshot.envOverrides)) {
  process.env[key] = value as string;
}

async function run() {
  const { calculateMinterRewards } = require("../modules/minter-rewards");
  const {
    calculateMinterRewardsV2,
  } = require("../modules/minter-rewards-v2");
  const { config } = require("../config");

  const cfg = config();

  console.log("=== Minter Calculator Comparison ===\n");
  console.log(`Windows: ${cfg.rewards.minter.windows.length}`);
  console.log(`MINTER_START_BLOCK: ${cfg.MINTER_START_BLOCK}`);
  console.log(`MINTER_END_BLOCK: ${cfg.MINTER_END_BLOCK}\n`);

  // Run old calculator
  console.log("Running OLD calculator...");
  const oldStart = Date.now();
  const oldResult = await calculateMinterRewards(
    cfg.MINTER_START_BLOCK,
    cfg.MINTER_END_BLOCK
  );
  const oldTime = Date.now() - oldStart;
  console.log(`  Done in ${oldTime}ms\n`);

  // Run new calculator
  console.log("Running NEW (v2) calculator...");
  const newStart = Date.now();
  const newResult = await calculateMinterRewardsV2(
    cfg.MINTER_START_BLOCK,
    cfg.MINTER_END_BLOCK
  );
  const newTime = Date.now() - newStart;
  console.log(`  Done in ${newTime}ms\n`);

  // Compare across all rewardToken / cType combos
  const allTokens = new Set([
    ...Object.keys(oldResult),
    ...Object.keys(newResult),
  ]);

  let totalMatches = 0;
  let totalMismatches = 0;
  const tolerance = 1e-6;

  for (const token of allTokens) {
    const oldTokenResult = oldResult[token] || {};
    const newTokenResult = newResult[token] || {};
    const allTypes = new Set([
      ...Object.keys(oldTokenResult),
      ...Object.keys(newTokenResult),
    ]);

    for (const cType of allTypes) {
      const oldUsers = oldTokenResult[cType] || {};
      const newUsers = newTokenResult[cType] || {};
      const allAddresses = new Set([
        ...Object.keys(oldUsers),
        ...Object.keys(newUsers),
      ]);

      let matches = 0;
      let mismatches = 0;
      const mismatchDetails: any[] = [];

      for (const addr of allAddresses) {
        const oldEarned = oldUsers[addr]?.earned ?? 0;
        const newEarned = newUsers[addr]?.earned ?? 0;
        const denom = Math.max(Math.abs(oldEarned), 1e-18);
        const relativeDiff = Math.abs(oldEarned - newEarned) / denom;

        if (relativeDiff > tolerance) {
          mismatches++;
          mismatchDetails.push({
            address: addr,
            oldEarned,
            newEarned,
            diff: relativeDiff,
          });
        } else {
          matches++;
        }
      }

      const oldTotal = Object.values(oldUsers).reduce(
        (acc: number, u: any) => acc + (u.earned || 0),
        0
      );
      const newTotal = Object.values(newUsers).reduce(
        (acc: number, u: any) => acc + (u.earned || 0),
        0
      );

      console.log(`--- ${token} / ${cType} ---`);
      console.log(`  Addresses: ${allAddresses.size}`);
      console.log(`  Matches: ${matches}, Mismatches: ${mismatches}`);
      console.log(`  Old total: ${oldTotal.toFixed(10)}`);
      console.log(`  New total: ${newTotal.toFixed(10)}`);

      if (mismatchDetails.length > 0) {
        console.log(`  Top mismatches:`);
        mismatchDetails
          .sort((a, b) => b.diff - a.diff)
          .slice(0, 5)
          .forEach((m) => {
            console.log(
              `    ${m.address}: old=${m.oldEarned.toFixed(10)} new=${m.newEarned.toFixed(10)} relDiff=${m.diff.toExponential(2)}`
            );
          });
      }

      totalMatches += matches;
      totalMismatches += mismatches;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total matches: ${totalMatches}`);
  console.log(`Total mismatches: ${totalMismatches}`);

  if (totalMismatches > 0) {
    console.log("\n=== FAIL ===");
    process.exit(1);
  } else {
    console.log("\n=== PASS — calculators produce identical results ===");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Comparison failed:", err);
  process.exit(1);
});
