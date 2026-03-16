/**
 * Debug: run old calculator with debug=true, print the event trace
 * Then manually compare with new distributor internals
 */
import { config as dotenvConfig } from "dotenv";
import path from "path";
import fs from "fs";

dotenvConfig({ path: path.join(__dirname, "..", "..", ".env") });

const snapshotPath = path.join(__dirname, "..", "..", "golden-snapshots", "snapshot.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
for (const [key, value] of Object.entries(snapshot.envOverrides)) {
  process.env[key] = value as string;
}

async function run() {
  const { calculateHaiaeroRewards } = require("../modules/haiaero-rewards");

  console.log("Running OLD calculator with debug=true...\n");
  const { users, debugData } = await calculateHaiaeroRewards(1000, undefined, true);

  if (!debugData) {
    console.error("No debug data!");
    return;
  }

  // Print init event
  const initEvt = debugData.events.find((e: any) => e.type === "init");
  if (initEvt) {
    console.log("INIT:", JSON.stringify(initEvt));
  }

  // Print all updateRewardPerWeight events
  console.log("\n=== REWARD PER WEIGHT UPDATES ===");
  debugData.events
    .filter((e: any) => e.type === "updateRewardPerWeight")
    .forEach((e: any, i: number) => {
      console.log(`  ${i}: ts=${e.timestamp} rpw=${e.rewardPerWeight} totalWeight=${e.totalStakingWeight} dt=${e.deltaTime}`);
    });

  // Print all earn events grouped
  console.log("\n=== USER EARN EVENTS ===");
  debugData.events
    .filter((e: any) => e.type === "userEarn")
    .forEach((e: any) => {
      console.log(`  ${e.address.slice(0,10)}: +${e.deltaEarned.toFixed(10)} total=${e.totalEarned.toFixed(10)} rpw=${e.rewardPerWeight} boost=${e.boost} weight=${e.stakingWeight} ts=${e.timestamp}`);
    });

  // Print collateral changes
  console.log("\n=== COLLATERAL CHANGES ===");
  debugData.events
    .filter((e: any) => e.type === "userCollateralChange")
    .forEach((e: any) => {
      console.log(`  ${e.address.slice(0,10)}: delta=${e.deltaCollateral} collateral=${e.collateral} weight=${e.stakingWeight} ts=${e.timestamp} new=${e.isNewUser}`);
    });

  // Final snapshot
  console.log("\n=== FINAL ===");
  const finalEvt = debugData.events.find((e: any) => e.type === "finalSnapshot");
  if (finalEvt) {
    console.log(`Total distributed: ${finalEvt.totalRewardsDistributed}`);
    finalEvt.users.forEach((u: any) => {
      console.log(`  ${u.address}: earned=${u.earned.toFixed(10)} boost=${u.boost} collateral=${u.collateral}`);
    });
  }
}

run().catch(console.error);
