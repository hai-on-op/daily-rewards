import { config } from "../config";
import { main } from "./main";

import { lpProvider, minterProvider } from "../utils/chain";
import { ethers } from "ethers";
import { REWARD_DISTRIBUTOR_ABI } from "../abis/REWARD_DISTRIBUTOR_ABI";

config();

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
  const cfg = config();

  const provider = new ethers.providers.JsonRpcProvider(
    cfg.DISTRIBUTOR_RPC_URL
  );
  const signer = new ethers.Wallet(cfg.REWARD_SETTER_PRIVATE_KEY, provider);

  // Get contract instance
  const rewardDistributor = new ethers.Contract(
    cfg.REWARD_DISTRIBUTOR_ADDRESS,
    REWARD_DISTRIBUTOR_ABI,
    signer
  );

  // Read current counter value
  const entryCounter = Number(
    String(await rewardDistributor.merkleRootCounter())
  );
  console.log("Current entry count:", entryCounter);

  process.env.LP_END_BLOCK = String(await lpProvider.getBlockNumber());
  process.env.MINTER_END_BLOCK = String(await minterProvider.getBlockNumber());

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
