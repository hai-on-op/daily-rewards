import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import { getTelegramBot } from "../../telegram-bot";

/**
 * Step: Initialize Telegram bot for notifications
 */
export class InitTelegramStep implements ProcessingStep {
  readonly name = "InitTelegram";

  isEnabled(flags: FeatureFlags): boolean {
    return flags.initTelegram;
  }

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    console.log(`[${this.name}] Initializing Telegram bot...`);
    
    try {
      const telegramBot = getTelegramBot(false); // Use non-polling mode
      console.log(
        `[${this.name}] Telegram bot initialized with ${telegramBot.getUserCount()} users`
      );
    } catch (error) {
      console.warn(`[${this.name}] Telegram bot initialization failed:`, error);
      // Don't fail the pipeline, just warn
    }

    return context;
  }
}

