import { config } from "../config";
import { main } from "./main";

import { haiveloProvider, lpProvider, minterProvider } from "../utils/chain";
import { ethers } from "ethers";
import { REWARD_DISTRIBUTOR_ABI } from "../abis/REWARD_DISTRIBUTOR_ABI";

config();

function multiplyLPConfigValues(config: any, multiplier: number): any {
  const result: any = {};

  for (const [token, amount] of Object.entries(config)) {
    result[token] = (amount as number) * multiplier;
  }

  return result;
}

function multiplyHaiveloConfigValues(config: any, multiplier: number): any {
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

  console.log("Reward Distributor Paused:", await rewardDistributor.paused());

  if (!rewardDistributor.paused()) {
    const tx = await rewardDistributor.pause();
    console.log("Reward Distributor Paused!");

    await tx.wait();
  }

  // Read current counter value
  const entryCounter = Number(String(await rewardDistributor.epochCounter()));

  if (entryCounter === 0) {
    const tx = await rewardDistributor.startInitialEpoch();
    console.log("Reward Distributor Started Initial Epoch!");
    await tx.wait();
  }

  console.log("Current entry count:", entryCounter);

  // We consider this blocknumber index delay for the subgraph
  const blockNumberDelay = 5;

  process.env.LP_END_BLOCK = String(
    (await lpProvider.getBlockNumber()) - blockNumberDelay
  );
  process.env.MINTER_END_BLOCK = String(
    (await minterProvider.getBlockNumber()) - blockNumberDelay
  );
  process.env.HAIVELO_END_BLOCK = String(
    (await haiveloProvider.getBlockNumber()) - blockNumberDelay
  );

  const effectiveEntryCounter = entryCounter - 1;

  try {
    // Parse and update REWARD_LP_CONFIG
    const currentLPConfig = JSON.parse(process.env.REWARD_LP_CONFIG || "{}");
    const multipliedLPConfig = multiplyLPConfigValues(
      currentLPConfig,
      effectiveEntryCounter
    );
    process.env.REWARD_LP_CONFIG = JSON.stringify(multipliedLPConfig);
    console.log("Updated REWARD_LP_CONFIG:", process.env.REWARD_LP_CONFIG);

    // Parse and update REWARD_HAIVELO_CONFIG
    const currentHaiveloConfig = JSON.parse(
      process.env.REWARD_HAIVELO_CONFIG || "{}"
    );
    const multipliedHaiveloConfig = multiplyHaiveloConfigValues(
      currentHaiveloConfig,
      effectiveEntryCounter
    );
    process.env.REWARD_HAIVELO_CONFIG = JSON.stringify(multipliedHaiveloConfig);
    console.log(
      "Updated REWARD_HAIVELO_CONFIG:",
      process.env.REWARD_HAIVELO_CONFIG
    );

    await main(entryCounter);

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

// Legacy code for minter rewards

/*
  process.env.MINTER_END_BLOCK = String(await minterProvider.getBlockNumber());


    // Parse and update REWARD_MINTER_CONFIG
    const currentMinterConfig = JSON.parse(
      process.env.REWARD_MINTER_CONFIG || "{}"
    );
    const multipliedMinterConfig = multiplyConfigValues(
      currentMinterConfig,
      effectiveEntryCounter
    );
    process.env.REWARD_MINTER_CONFIG = JSON.stringify(multipliedMinterConfig);
    console.log(
      "Updated REWARD_MINTER_CONFIG:",
      process.env.REWARD_MINTER_CONFIG
    );
    

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

  */
