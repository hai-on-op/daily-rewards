/**
 * Compare old vs new LP reward calculators.
 *
 * Usage:
 *   npx ts-node src/scripts/compare-lp.ts
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
  const { calculateLpRewards } = require("../modules/lp-rewards");
  const { calculateLpRewardsV2 } = require("../modules/lp-rewards-v2");

  const rewardAmount = 1000;

  console.log("=== LP Calculator Comparison ===\n");
  console.log(`Reward amount: ${rewardAmount}\n`);

  // Run old calculator
  console.log("Running OLD calculator...");
  const oldStart = Date.now();
  const oldUsers = await calculateLpRewards(rewardAmount);
  const oldTime = Date.now() - oldStart;
  console.log(
    `  Done in ${oldTime}ms — ${Object.keys(oldUsers).length} users\n`
  );

  // Run new calculator
  console.log("Running NEW (v2) calculator...");
  const newStart = Date.now();
  const newUsers = await calculateLpRewardsV2(rewardAmount);
  const newTime = Date.now() - newStart;
  console.log(
    `  Done in ${newTime}ms — ${Object.keys(newUsers).length} users\n`
  );

  // Compare
  const allAddresses = new Set([
    ...Object.keys(oldUsers),
    ...Object.keys(newUsers),
  ]);

  let mismatches = 0;
  let matches = 0;
  const tolerance = 1e-6;

  const mismatchDetails: Array<{
    address: string;
    oldEarned: number;
    newEarned: number;
    diff: number;
  }> = [];

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
    (acc: number, u: any) => acc + u.earned,
    0
  );
  const newTotal = Object.values(newUsers).reduce(
    (acc: number, u: any) => acc + u.earned,
    0
  );

  console.log("=== RESULTS ===\n");
  console.log(`Total addresses: ${allAddresses.size}`);
  console.log(`Matches:    ${matches}`);
  console.log(`Mismatches: ${mismatches}`);
  console.log(`\nOld total distributed: ${oldTotal}`);
  console.log(`New total distributed: ${newTotal}`);
  console.log(`Difference: ${Math.abs(oldTotal - newTotal)}`);

  if (mismatches > 0) {
    console.log(`\n=== MISMATCHES (top 20) ===\n`);
    mismatchDetails
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 20)
      .forEach((m) => {
        console.log(
          `  ${m.address}: old=${m.oldEarned.toFixed(10)} new=${m.newEarned.toFixed(10)} relDiff=${m.diff.toExponential(2)}`
        );
      });

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
