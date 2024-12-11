import { config } from "../config";
import fs from "fs/promises";
import path from "path";
import { main } from "./main";

config();

const COUNTER_FILE = path.join(__dirname, "../../.counter.json");

async function readCounter(): Promise<number> {
  try {
    const data = await fs.readFile(COUNTER_FILE, "utf8");
    const json = JSON.parse(data);
    return json.counter || 0;
  } catch (error) {
    // If file doesn't exist or is invalid, return 0
    return 0;
  }
}

async function writeCounter(value: number): Promise<void> {
  await fs.writeFile(COUNTER_FILE, JSON.stringify({ counter: value }, null, 2));
}

function multiplyConfigValues(config: any, multiplier: number): any {
  const result: any = {};

  for (const [token, tokenConfig] of Object.entries(config)) {
    result[token] = {};
    for (const [collateral, amount] of Object.entries(tokenConfig as any)) {
      result[token][collateral] = (amount as number) * multiplier;
    }
  }

  return result;
}

function multiplyLPConfigValues(config: any, multiplier: number): any {
  const result: any = {};

  for (const [token, amount] of Object.entries(config)) {
    result[token] = (amount as number) * multiplier;
  }

  return result;
}

const entry = async () => {
  // Read current counter value
  const entryCounter = await readCounter();
  console.log("Current entry count:", entryCounter);

  try {
    // Parse and update REWARD_MINTER_CONFIG
    const currentMinterConfig = JSON.parse(
      process.env.REWARD_MINTER_CONFIG || "{}"
    );
    const multipliedMinterConfig = multiplyConfigValues(
      currentMinterConfig,
      entryCounter + 1
    );
    process.env.REWARD_MINTER_CONFIG = JSON.stringify(multipliedMinterConfig);
    console.log(
      "Updated REWARD_MINTER_CONFIG:",
      process.env.REWARD_MINTER_CONFIG
    );

    // Parse and update REWARD_LP_CONFIG
    const currentLPConfig = JSON.parse(process.env.REWARD_LP_CONFIG || "{}");
    const multipliedLPConfig = multiplyLPConfigValues(
      currentLPConfig,
      entryCounter + 1
    );
    process.env.REWARD_LP_CONFIG = JSON.stringify(multipliedLPConfig);
    console.log("Updated REWARD_LP_CONFIG:", process.env.REWARD_LP_CONFIG);

    main();

    // Increment and save counter after successful execution
    await writeCounter(entryCounter + 1);
    console.log("Entry count updated to:", entryCounter + 1);
  } catch (error) {
    console.error("Error in entry function:", error);
    throw error;
  }
};

entry()
  .then(() => {})
  .catch((err) => {
    console.error(err);
  });
