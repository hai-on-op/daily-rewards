import * as fs from "fs";
import * as path from "path";
import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import {
  updateManifestStatus,
  upsertManifestToken,
} from "../../../services/ops-state";

/**
 * Step: Save merkle tree backups to local filesystem
 */
export class BackupStep implements ProcessingStep {
  readonly name = "Backup";

  isEnabled(flags: FeatureFlags): boolean {
    return flags.saveBackups;
  }

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    console.log(`[${this.name}] Saving merkle trees as backup files...`);

    if (!context.merkleTrees || Object.keys(context.merkleTrees).length === 0) {
      console.log(`[${this.name}] No merkle trees to backup`);
      return context;
    }

    const currentDate = new Date();
    const dateString = currentDate.toISOString().split("T")[0]; // YYYY-MM-DD format
    const timestamp = currentDate.toISOString().replace(/[:.]/g, "-"); // Full timestamp for uniqueness

    // Create backup directory if it doesn't exist
    const backupDir = path.join(process.cwd(), "merkle-backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log(
      `[${this.name}] Saving merkle trees as backup files for entry ${context.entryCounter}...`
    );

    const errors: Error[] = [];

    for (const [token, tree] of Object.entries(context.merkleTrees)) {
      try {
        const filename = `merkle-tree-${token}-entry${context.entryCounter}-${dateString}-${timestamp}.json`;
        const filepath = path.join(backupDir, filename);
        const relativeFilepath = path.relative(process.cwd(), filepath);

        // Include gross rewards (pre-claim) for comparison tooling
        const grossRewards = context.adjustedRewards?.[token] || [];

        const treeData = {
          token,
          entryCounter: context.entryCounter,
          date: currentDate.toISOString(),
          root: tree.root,
          tree: tree.dump(),
          grossRewards,
        };

        fs.writeFileSync(filepath, JSON.stringify(treeData, null, 2));
        console.log(`[${this.name}] Merkle tree for ${token} saved to: ${filename} (${grossRewards.length} gross entries)`);
        if (context.runManifest) {
          upsertManifestToken(context.runManifest, token, {
            backupFile: relativeFilepath,
            backupVerified: true,
            backupError: undefined,
          });
        }
      } catch (error) {
        console.error(`[${this.name}] Error saving merkle tree for ${token}:`, error);
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length > 0) {
      const error = new Error(
        `[${this.name}] Backup failed; refusing to continue to on-chain update`
      );
      context.errors.push(...errors, error);
      throw error;
    }

    if (context.runManifest) {
      updateManifestStatus(context.runManifest, "backed_up");
    }

    return context;
  }
}
