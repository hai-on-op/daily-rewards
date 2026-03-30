import * as fs from "fs";
import * as path from "path";
import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";

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

    for (const [token, tree] of Object.entries(context.merkleTrees)) {
      try {
        const filename = `merkle-tree-${token}-entry${context.entryCounter}-${dateString}-${timestamp}.json`;
        const filepath = path.join(backupDir, filename);

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
      } catch (error) {
        console.error(`[${this.name}] Error saving merkle tree for ${token}:`, error);
        context.errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    return context;
  }
}

