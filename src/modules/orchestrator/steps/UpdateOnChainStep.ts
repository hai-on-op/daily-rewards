import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import { notifyTransaction, notifyMerkleUpdate } from "../../telegram-bot";
import { getTokenAddressMap } from "../contractHelpers";
import {
  saveRootUpdateManifest,
  updateManifestStatus,
} from "../../../services/ops-state";

/**
 * Step: Update merkle roots on the blockchain
 */
export class UpdateOnChainStep implements ProcessingStep {
  readonly name = "UpdateOnChain";

  isEnabled(flags: FeatureFlags): boolean {
    return flags.updateOnChain;
  }

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    console.log(`[${this.name}] Updating merkle roots on-chain...`);

    if (!context.merkleTrees || Object.keys(context.merkleTrees).length === 0) {
      console.log(`[${this.name}] No merkle trees to update`);
      return context;
    }

    const tokenAddressMap = getTokenAddressMap();

    // Prepare arrays for updateMerkleRoots
    const tokenAddresses: string[] = [];
    const roots: string[] = [];

    // Build arrays for the contract call
    for (const [token, tree] of Object.entries(context.merkleTrees)) {
      const tokenAddress = tokenAddressMap[token as keyof typeof tokenAddressMap];
      if (!tokenAddress) {
        console.warn(`[${this.name}] No address found for token: ${token}`);
        continue;
      }

      tokenAddresses.push(tokenAddress);
      roots.push(tree.root);
      console.log(`[${this.name}] Merkle root for ${token} (${tokenAddress}): ${tree.root}`);
    }

    try {
      console.log(`[${this.name}] Updating merkle roots...`);

      // Notify transaction initiation
      if (context.flags.sendNotifications) {
        await notifyTransaction({
          type: "initiate",
          operation: "Update Merkle Roots",
          details: {
            tokens: Object.keys(context.merkleTrees),
            tokenAddresses,
            tokenCount: tokenAddresses.length,
          },
        });
      }

      const tx = await context.rewardDistributor.updateMerkleRoots(
        tokenAddresses,
        roots
      );
      console.log(`[${this.name}] Transaction hash: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`[${this.name}] Transaction confirmed in block: ${receipt?.blockNumber}`);

      if (context.runManifest) {
        context.runManifest.updateTxHash = tx.hash;
        context.runManifest.updateBlock = receipt?.blockNumber;
        context.runManifest.entryCounterAfter = Number(
          String(await context.rewardDistributor.epochCounter())
        );
        updateManifestStatus(context.runManifest, "updated_on_chain");
        saveRootUpdateManifest(context.runManifest);
      }

      // Notify transaction success
      if (context.flags.sendNotifications) {
        await notifyTransaction({
          type: "success",
          operation: "Update Merkle Roots",
          txHash: tx.hash,
          blockNumber: receipt?.blockNumber,
          details: {
            tokens: Object.keys(context.merkleTrees),
            gasUsed: receipt?.gasUsed?.toString(),
          },
        });

        // Send merkle update notification
        await notifyMerkleUpdate(Object.keys(context.merkleTrees), roots);
      }
    } catch (error) {
      console.error(`[${this.name}] Error updating merkle roots:`, error);

      // Notify transaction failure
      if (context.flags.sendNotifications) {
        await notifyTransaction({
          type: "failure",
          operation: "Update Merkle Roots",
          error: error instanceof Error ? error.message : "Unknown error",
          details: {
            tokens: Object.keys(context.merkleTrees),
            tokenAddresses,
          },
        });
      }

      throw error;
    }

    return context;
  }
}
