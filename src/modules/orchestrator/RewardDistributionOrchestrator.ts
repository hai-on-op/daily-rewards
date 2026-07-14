import { ethers } from "ethers";
import { ProcessingStep, ProcessingContext, FeatureFlags } from "./types";
import { createContractConnection, getEpochCounter } from "./contractHelpers";
import { logFeatureFlags } from "./featureFlags";
import { config } from "../../config";
import { notifyTransaction } from "../telegram-bot";

import {
  InitTelegramStep,
  PauseContractStep,
  HandleInitialEpochStep,
  PrepareConfigStep,
  CalculateRewardsStep,
  GenerateMerkleTreesStep,
  UpdateOnChainStep,
  BackupStep,
  CloudUploadStep,
  VerifyRootUpdateStep,
} from "./steps";
import {
  createRootUpdateManifest,
  recordManifestError,
  saveRootUpdateManifest,
} from "../../services/ops-state";

/**
 * Creates the default processing pipeline with all steps in order
 */
function createDefaultPipeline(): ProcessingStep[] {
  return [
    new InitTelegramStep(),
    new PauseContractStep(),
    new HandleInitialEpochStep(),
    new PrepareConfigStep(),
    new CalculateRewardsStep(),
    new GenerateMerkleTreesStep(),
    new BackupStep(),
    new UpdateOnChainStep(),
    new CloudUploadStep(),
    new VerifyRootUpdateStep(),
  ];
}

/**
 * Creates an initial processing context
 */
function createInitialContext(flags: FeatureFlags): ProcessingContext {
  const { provider, signer, rewardDistributor } = createContractConnection();

  return {
    flags,
    entryCounter: 0,
    effectiveEntryCounter: 0,
    provider,
    signer,
    rewardDistributor,
    wasContractPaused: false,
    blockNumbers: {
      lp: 0,
      minter: 0,
      haivelo: 0,
    },
    rewards: null,
    adjustedRewards: null,
    finalRewards: null,
    merkleTrees: null,
    errors: [],
    runManifest: flags.updateOnChain ? createRootUpdateManifest() : null,
  };
}

function syncManifestFromContext(context: ProcessingContext): void {
  if (!context.runManifest) return;

  context.runManifest.entryCounterBefore = context.entryCounter;
  context.runManifest.effectiveEntryCounter = context.effectiveEntryCounter;
  if (
    context.blockNumbers.lp ||
    context.blockNumbers.minter ||
    context.blockNumbers.haivelo
  ) {
    context.runManifest.blockNumbers = { ...context.blockNumbers };
  }
  saveRootUpdateManifest(context.runManifest);
}

/**
 * RewardDistributionOrchestrator
 * 
 * Orchestrates the reward distribution process by running a pipeline of steps.
 * Each step can be enabled/disabled via feature flags, allowing for environment-specific
 * configuration without code changes.
 * 
 * Usage:
 * ```typescript
 * const orchestrator = new RewardDistributionOrchestrator(flags);
 * await orchestrator.run();
 * ```
 */
export class RewardDistributionOrchestrator {
  private flags: FeatureFlags;
  private pipeline: ProcessingStep[];

  constructor(flags: FeatureFlags, customPipeline?: ProcessingStep[]) {
    this.flags = flags;
    this.pipeline = customPipeline || createDefaultPipeline();
  }

  /**
   * Run the reward distribution pipeline
   */
  async run(): Promise<ProcessingContext> {
    console.log("========================================");
    console.log("Reward Distribution Orchestrator Starting");
    console.log("========================================");

    logFeatureFlags(this.flags);

    // Initialize context
    let context = createInitialContext(this.flags);
    syncManifestFromContext(context);

    // Get initial epoch counter if we're not handling it in a step
    if (!this.flags.handleInitialEpoch) {
      context.entryCounter = await getEpochCounter(context.rewardDistributor);
      context.effectiveEntryCounter = context.entryCounter - 1;
      console.log(`Entry counter: ${context.entryCounter}, Effective: ${context.effectiveEntryCounter}`);
    }

    // Track step execution
    const executedSteps: string[] = [];
    const skippedSteps: string[] = [];
    let activeStep: string | null = null;

    try {
      // Execute each step in the pipeline
      for (const step of this.pipeline) {
        if (step.isEnabled(this.flags)) {
          activeStep = step.name;
          console.log(`\n>>> Executing step: ${step.name}`);
          const startTime = Date.now();
          
          context = await step.execute(context);
          syncManifestFromContext(context);
          
          const duration = Date.now() - startTime;
          console.log(`<<< Step ${step.name} completed in ${duration}ms`);
          executedSteps.push(step.name);
          activeStep = null;
        } else {
          console.log(`--- Skipping step: ${step.name} (disabled)`);
          skippedSteps.push(step.name);
        }
      }

      // Log summary
      console.log("\n========================================");
      console.log("Pipeline Execution Summary");
      console.log("========================================");
      console.log(`Executed steps: ${executedSteps.join(", ") || "none"}`);
      console.log(`Skipped steps: ${skippedSteps.join(", ") || "none"}`);
      console.log(`Errors: ${context.errors.length}`);

      if (context.errors.length > 0) {
        console.log("\nErrors encountered:");
        context.errors.forEach((err, idx) => {
          console.log(`  ${idx + 1}. ${err.message}`);
        });
      }

      // Notify successful completion
      if (this.flags.sendNotifications && context.effectiveEntryCounter > 0) {
        await notifyTransaction({
          type: "success",
          operation: "Process Daily Rewards",
          details: {
            completedEntryCounter: context.entryCounter,
            nextEntryCounter: context.entryCounter + 1,
            executedSteps,
            skippedSteps,
          },
        });
      }

      console.log("\n========================================");
      console.log("Reward Distribution Complete");
      console.log("========================================");

      return context;
    } catch (error) {
      if (context.runManifest) {
        recordManifestError(context.runManifest, error);
      }

      console.error("\n========================================");
      console.error("Pipeline Failed");
      console.error("========================================");
      console.error("Error:", error);

      // Notify failure
      if (this.flags.sendNotifications) {
        await notifyTransaction({
          type: "failure",
          operation: "Process Daily Rewards",
          error: error instanceof Error ? error.message : "Unknown error",
          details: {
            failedAtEntryCounter: context.entryCounter,
            effectiveEntryCounter: context.effectiveEntryCounter,
            executedSteps,
            failedAt: activeStep || "initialization",
          },
        });
      }

      throw error;
    }
  }

  /**
   * Get the list of steps that would be executed with current flags
   */
  getEnabledSteps(): string[] {
    return this.pipeline
      .filter((step) => step.isEnabled(this.flags))
      .map((step) => step.name);
  }

  /**
   * Get the list of steps that would be skipped with current flags
   */
  getDisabledSteps(): string[] {
    return this.pipeline
      .filter((step) => !step.isEnabled(this.flags))
      .map((step) => step.name);
  }
}
