/**
 * Debug: run new v2 calculator with internal logging
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
  const { config } = require("../config");
  const { haiveloProvider } = require("../utils/chain");
  const { HaiAeroStrategy } = require("../core/rewards/strategies/HaiAeroStrategy");
  const { TimeWeightedDistributor } = require("../core/rewards/TimeWeightedDistributor");

  const cfg = config();
  const blockRange = {
    startBlock: cfg.HAIAERO_START_BLOCK,
    endBlock: cfg.HAIAERO_END_BLOCK,
  };

  const strategy = new HaiAeroStrategy();
  const distributor = new TimeWeightedDistributor();

  const [startTimestamp, endTimestamp] = await Promise.all([
    haiveloProvider.getBlock(blockRange.startBlock).then((b: any) => b.timestamp),
    haiveloProvider.getBlock(blockRange.endBlock).then((b: any) => b.timestamp),
  ]);

  const [initialUsers, events] = await Promise.all([
    strategy.getInitialUsers(blockRange),
    strategy.getEvents(blockRange),
  ]);

  console.log(`startTimestamp=${startTimestamp} endTimestamp=${endTimestamp}`);
  console.log(`initialUsers=${initialUsers.size} events=${events.length}`);
  console.log("\nEvents:");
  events.forEach((e: any, i: number) => {
    console.log(`  ${i}: ts=${e.timestamp} addr=${e.address?.slice(0,10)} delta=${e.deltaCollateral}`);
  });

  // Run distributor with manual tracing
  const rewardAmount = 1000;
  const rewardRate = rewardAmount / (endTimestamp - startTimestamp);
  console.log(`\nrewardRate=${rewardRate}`);

  const result = await distributor.distribute(strategy, events, initialUsers, {
    startTimestamp,
    endTimestamp,
    rewardAmount,
  });

  console.log("\n=== RESULTS ===");
  for (const [addr, amount] of result.earned) {
    console.log(`  ${addr}: earned=${amount.toFixed(10)}`);
  }

  const total = Array.from(result.earned.values()).reduce((s, v) => s + v, 0);
  console.log(`\nTotal: ${total}`);
}

run().catch(console.error);
