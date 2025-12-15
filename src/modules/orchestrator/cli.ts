/**
 * CLI Entry Point for Reward Distribution
 * 
 * This is the new entry point that replaces the old entry.ts module.
 * It uses the RewardDistributionOrchestrator with feature flags for
 * environment-specific configuration.
 * 
 * Usage:
 *   # Production mode (all features enabled)
 *   FEATURE_MODE=production npx ts-node src/modules/orchestrator/cli.ts
 * 
 *   # Development mode (minimal operations)
 *   FEATURE_MODE=development npx ts-node src/modules/orchestrator/cli.ts
 * 
 *   # Dry-run mode (calculate but don't persist)
 *   FEATURE_MODE=dry-run npx ts-node src/modules/orchestrator/cli.ts
 * 
 *   # Custom mode with individual flag overrides
 *   FEATURE_MODE=custom FEATURE_UPDATE_ON_CHAIN=false npx ts-node src/modules/orchestrator/cli.ts
 * 
 * Environment Variables:
 *   FEATURE_MODE: "production" | "development" | "dry-run" | "custom"
 *   FEATURE_INIT_TELEGRAM: "true" | "false"
 *   FEATURE_PAUSE_CONTRACT: "true" | "false"
 *   FEATURE_HANDLE_INITIAL_EPOCH: "true" | "false"
 *   FEATURE_PREPARE_CONFIG: "true" | "false"
 *   FEATURE_CALCULATE_REWARDS: "true" | "false"
 *   FEATURE_GENERATE_MERKLE_TREES: "true" | "false"
 *   FEATURE_UPDATE_ON_CHAIN: "true" | "false"
 *   FEATURE_SAVE_BACKUPS: "true" | "false"
 *   FEATURE_UPLOAD_TO_CLOUDFLARE: "true" | "false"
 *   FEATURE_SEND_NOTIFICATIONS: "true" | "false"
 */

// IMPORTANT: Load dotenv FIRST before any other imports
// Many modules call config() at the top level, so env vars must be loaded first
import { config as dotenv } from "dotenv";
dotenv();

// Now safe to import other modules
import { config } from "../../config";
import { loadFeatureFlags } from "./featureFlags";
import { RewardDistributionOrchestrator } from "./RewardDistributionOrchestrator";

// Validate config is loadable
config();

async function main(): Promise<void> {
  console.log("========================================");
  console.log("Daily Rewards Distribution CLI");
  console.log("========================================");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Feature Mode: ${process.env.FEATURE_MODE || "production"}`);
  console.log("========================================\n");

  // Load feature flags from environment
  const flags = loadFeatureFlags();

  // Create and run orchestrator
  const orchestrator = new RewardDistributionOrchestrator(flags);
  
  try {
    const context = await orchestrator.run();
    
    // Exit with success
    console.log("\nProcess completed successfully.");
    
    // Return non-zero exit if there were non-fatal errors
    if (context.errors.length > 0) {
      console.warn(`Warning: ${context.errors.length} non-fatal errors occurred.`);
      process.exit(0); // Still success, but with warnings
    }
    
    process.exit(0);
  } catch (error) {
    console.error("\nProcess failed with error:", error);
    process.exit(1);
  }
}

// Run the CLI
main();

