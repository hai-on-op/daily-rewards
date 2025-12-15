import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import { notifyTransaction } from "../../telegram-bot";
import { getEpochCounter } from "../contractHelpers";

/**
 * Step: Handle initial epoch setup if counter is 0
 */
export class HandleInitialEpochStep implements ProcessingStep {
  readonly name = "HandleInitialEpoch";

  isEnabled(flags: FeatureFlags): boolean {
    return flags.handleInitialEpoch;
  }

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    console.log(`[${this.name}] Checking epoch counter...`);

    const entryCounter = await getEpochCounter(context.rewardDistributor);
    context.entryCounter = entryCounter;
    context.effectiveEntryCounter = entryCounter - 1;

    console.log(`[${this.name}] Current entry count: ${entryCounter}`);

    if (entryCounter === 0) {
      console.log(`[${this.name}] Starting initial epoch...`);
      
      try {
        // Notify initial epoch start
        if (context.flags.sendNotifications) {
          await notifyTransaction({
            type: "initiate",
            operation: "Start Initial Epoch",
            details: { epochCounter: 0 },
          });
        }

        const tx = await context.rewardDistributor.startInitialEpoch();
        console.log(`[${this.name}] Reward Distributor Started Initial Epoch!`);

        const receipt = await tx.wait();

        // Notify success
        if (context.flags.sendNotifications) {
          await notifyTransaction({
            type: "success",
            operation: "Start Initial Epoch",
            txHash: tx.hash,
            blockNumber: receipt?.blockNumber,
            details: { newEpochCounter: 1 },
          });
        }

        // Update counters after initial epoch
        context.entryCounter = 1;
        context.effectiveEntryCounter = 0;
      } catch (error) {
        // Initial epoch may have already been started, log but don't throw
        console.warn(`[${this.name}] Error starting initial epoch (may already exist):`, error);
      }
    }

    return context;
  }
}

