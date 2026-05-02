import { config } from "../config";
import { ethers } from "ethers";
import { REWARD_DISTRIBUTOR_ABI } from "../abis/REWARD_DISTRIBUTOR_ABI";
import { notifyTransaction, getTelegramBot } from "./telegram-bot";
import {
  saveRootUpdateManifest,
  saveUnpauseManifest,
  verifyLatestRootUpdateForUnpause,
} from "../services/ops-state";

config();

const unpause = async () => {
  const cfg = config();

  // Initialize Telegram bot (non-polling mode)
  try {
    const telegramBot = getTelegramBot(false);
    console.log(`Telegram bot initialized with ${telegramBot.getUserCount()} users`);
  } catch (error) {
    console.warn('Telegram bot initialization failed:', error);
  }

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

  try {
    const verification = await verifyLatestRootUpdateForUnpause(cfg);
    if (!verification.ok) {
      const message = `Unpause guard failed: ${verification.errors.join("; ")}`;
      console.error(message);
      await notifyTransaction({
        type: 'failure',
        operation: 'Unpause Reward Distributor',
        error: message,
        details: verification.contractState,
      });
      throw new Error(message);
    }

    // Notify unpause initiation
    await notifyTransaction({
      type: 'initiate',
      operation: 'Unpause Reward Distributor',
      details: {
        currentStatus: 'paused',
        rootUpdateRunId: verification.manifest?.runId,
      }
    });

    console.log("Unpausing Reward Distributor...");
    const tx = await rewardDistributor.unpause();
    console.log("Reward Distributor Unpause transaction sent!");
    
    const receipt = await tx.wait();
    console.log("Reward Distributor Successfully Unpaused!");
    const [paused, epochCounter] = await Promise.all([
      rewardDistributor.paused(),
      rewardDistributor.epochCounter(),
    ]);

    saveUnpauseManifest({
      version: 1,
      rootUpdateRunId: verification.manifest?.runId,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      completedAt: new Date().toISOString(),
      epochCounter: String(epochCounter),
      paused,
    });

    if (verification.manifest) {
      verification.manifest.unpauseTxHash = tx.hash;
      verification.manifest.unpausedAt = new Date().toISOString();
      saveRootUpdateManifest(verification.manifest);
    }

    // Notify unpause success
    await notifyTransaction({
      type: 'success',
      operation: 'Unpause Reward Distributor',
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      details: { 
        newStatus: 'unpaused',
        rootUpdateRunId: verification.manifest?.runId,
        gasUsed: receipt?.gasUsed?.toString()
      }
    });

  } catch (error) {
    console.error("Error unpausing reward distributor:", error);
    
    // Notify unpause failure
    await notifyTransaction({
      type: 'failure',
      operation: 'Unpause Reward Distributor',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw error;
  }
};

unpause()
  .then(() => {
    console.log("Unpause operation completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error unpausing reward distributor:", err);
    process.exit(1);
  });
