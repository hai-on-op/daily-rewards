import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import { notifyTransaction } from "../../telegram-bot";
import { isContractPaused } from "../contractHelpers";

/**
 * Step: Pause the reward distributor contract before processing
 */
export class PauseContractStep implements ProcessingStep {
  readonly name = "PauseContract";

  isEnabled(flags: FeatureFlags): boolean {
    return flags.pauseContract;
  }

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    console.log(`[${this.name}] Checking contract pause state...`);

    const isPaused = await isContractPaused(context.rewardDistributor);
    context.wasContractPaused = isPaused;

    console.log(`[${this.name}] Reward Distributor Paused: ${isPaused}`);

    if (!isPaused) {
      try {
        // Notify pause initiation
        if (context.flags.sendNotifications) {
          await notifyTransaction({
            type: "initiate",
            operation: "Pause Reward Distributor",
            details: { currentStatus: "unpaused" },
          });
        }

        const tx = await context.rewardDistributor.pause();
        console.log(`[${this.name}] Reward Distributor Paused!`);

        const receipt = await tx.wait();

        // Notify pause success
        if (context.flags.sendNotifications) {
          await notifyTransaction({
            type: "success",
            operation: "Pause Reward Distributor",
            txHash: tx.hash,
            blockNumber: receipt?.blockNumber,
            details: { newStatus: "paused" },
          });
        }
      } catch (error) {
        // Notify pause failure
        if (context.flags.sendNotifications) {
          await notifyTransaction({
            type: "failure",
            operation: "Pause Reward Distributor",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
        throw error;
      }
    }

    return context;
  }
}

