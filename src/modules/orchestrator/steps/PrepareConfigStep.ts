import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import { multiplyConfigValues, getBlockNumbersWithDelay } from "../contractHelpers";
import { notifyTransaction } from "../../telegram-bot";

/**
 * Step: Prepare block numbers and multiply configs by epoch counter
 */
export class PrepareConfigStep implements ProcessingStep {
  readonly name = "PrepareConfig";

  isEnabled(flags: FeatureFlags): boolean {
    return flags.prepareConfig;
  }

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    console.log(`[${this.name}] Preparing configuration...`);

    // Skip if no effective counter (initial epoch case)
    if (context.effectiveEntryCounter <= 0) {
      console.log(`[${this.name}] Skipping - no rewards to process (effective counter: ${context.effectiveEntryCounter})`);
      return context;
    }

    // Import providers lazily to ensure config/dotenv is loaded first
    const { haiveloProvider, lpProvider, minterProvider } = await import("../../../utils/chain");

    // Get block numbers with delay for subgraph indexing
    const blockNumberDelay = 30;
    const blockNumbers = await getBlockNumbersWithDelay(
      lpProvider,
      minterProvider,
      haiveloProvider,
      blockNumberDelay
    );

    context.blockNumbers = {
      lp: blockNumbers.lpEndBlock,
      minter: blockNumbers.minterEndBlock,
      haivelo: blockNumbers.haiveloEndBlock,
    };

    // Set environment variables for downstream modules
    process.env.LP_END_BLOCK = String(blockNumbers.lpEndBlock);
    process.env.MINTER_END_BLOCK = String(blockNumbers.minterEndBlock);
    process.env.HAIVELO_END_BLOCK = String(blockNumbers.haiveloEndBlock);

    console.log(`[${this.name}] Block numbers set:`, context.blockNumbers);

    // Parse and update REWARD_LP_CONFIG
    const currentLPConfig = JSON.parse(process.env.REWARD_LP_CONFIG || "{}");
    const multipliedLPConfig = multiplyConfigValues(
      currentLPConfig,
      context.effectiveEntryCounter
    );
    process.env.REWARD_LP_CONFIG = JSON.stringify(multipliedLPConfig);
    console.log(`[${this.name}] Updated REWARD_LP_CONFIG:`, process.env.REWARD_LP_CONFIG);

    // Parse and update REWARD_HAIVELO_CONFIG
    const currentHaiveloConfig = JSON.parse(
      process.env.REWARD_HAIVELO_CONFIG || "{}"
    );
    const multipliedHaiveloConfig = multiplyConfigValues(
      currentHaiveloConfig,
      context.effectiveEntryCounter
    );
    process.env.REWARD_HAIVELO_CONFIG = JSON.stringify(multipliedHaiveloConfig);
    console.log(
      `[${this.name}] Updated REWARD_HAIVELO_CONFIG:`,
      process.env.REWARD_HAIVELO_CONFIG
    );

    // Notify start of reward processing
    if (context.flags.sendNotifications) {
      await notifyTransaction({
        type: "initiate",
        operation: "Process Daily Rewards",
        details: {
          entryCounter: context.entryCounter,
          effectiveEntryCounter: context.effectiveEntryCounter,
          lpEndBlock: process.env.LP_END_BLOCK,
          minterEndBlock: process.env.MINTER_END_BLOCK,
          haiveloEndBlock: process.env.HAIVELO_END_BLOCK,
        },
      });
    }

    return context;
  }
}

