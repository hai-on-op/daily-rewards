import {
  FeatureFlags,
  DEFAULT_FEATURE_FLAGS,
  DEV_FEATURE_FLAGS,
  DRY_RUN_FEATURE_FLAGS,
} from "./types";

/**
 * Environment mode for feature flag presets
 */
export type EnvironmentMode = "production" | "development" | "dry-run" | "custom";

/**
 * Parse a boolean from environment variable
 */
function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

/**
 * Get feature flags based on environment mode.
 * 
 * Precedence:
 * 1. Individual FEATURE_* environment variables (highest)
 * 2. Preset based on FEATURE_MODE environment variable
 * 3. Default production flags (lowest)
 * 
 * Environment variables:
 * - FEATURE_MODE: "production" | "development" | "dry-run" | "custom"
 * - FEATURE_INIT_TELEGRAM: "true" | "false"
 * - FEATURE_PAUSE_CONTRACT: "true" | "false"
 * - FEATURE_HANDLE_INITIAL_EPOCH: "true" | "false"
 * - FEATURE_PREPARE_CONFIG: "true" | "false"
 * - FEATURE_CALCULATE_REWARDS: "true" | "false"
 * - FEATURE_GENERATE_MERKLE_TREES: "true" | "false"
 * - FEATURE_UPDATE_ON_CHAIN: "true" | "false"
 * - FEATURE_SAVE_BACKUPS: "true" | "false"
 * - FEATURE_UPLOAD_TO_CLOUDFLARE: "true" | "false"
 * - FEATURE_SEND_NOTIFICATIONS: "true" | "false"
 */
export function loadFeatureFlags(): FeatureFlags {
  const mode = (process.env.FEATURE_MODE || "production") as EnvironmentMode;
  
  // Get base flags from preset
  let baseFlags: FeatureFlags;
  switch (mode) {
    case "development":
      baseFlags = { ...DEV_FEATURE_FLAGS };
      break;
    case "dry-run":
      baseFlags = { ...DRY_RUN_FEATURE_FLAGS };
      break;
    case "custom":
    case "production":
    default:
      baseFlags = { ...DEFAULT_FEATURE_FLAGS };
      break;
  }

  // Override with individual environment variables if set
  return {
    initTelegram: parseEnvBoolean(
      process.env.FEATURE_INIT_TELEGRAM,
      baseFlags.initTelegram
    ),
    pauseContract: parseEnvBoolean(
      process.env.FEATURE_PAUSE_CONTRACT,
      baseFlags.pauseContract
    ),
    handleInitialEpoch: parseEnvBoolean(
      process.env.FEATURE_HANDLE_INITIAL_EPOCH,
      baseFlags.handleInitialEpoch
    ),
    prepareConfig: parseEnvBoolean(
      process.env.FEATURE_PREPARE_CONFIG,
      baseFlags.prepareConfig
    ),
    calculateRewards: parseEnvBoolean(
      process.env.FEATURE_CALCULATE_REWARDS,
      baseFlags.calculateRewards
    ),
    generateMerkleTrees: parseEnvBoolean(
      process.env.FEATURE_GENERATE_MERKLE_TREES,
      baseFlags.generateMerkleTrees
    ),
    updateOnChain: parseEnvBoolean(
      process.env.FEATURE_UPDATE_ON_CHAIN,
      baseFlags.updateOnChain
    ),
    saveBackups: parseEnvBoolean(
      process.env.FEATURE_SAVE_BACKUPS,
      baseFlags.saveBackups
    ),
    uploadToCloudflare: parseEnvBoolean(
      process.env.FEATURE_UPLOAD_TO_CLOUDFLARE,
      baseFlags.uploadToCloudflare
    ),
    sendNotifications: parseEnvBoolean(
      process.env.FEATURE_SEND_NOTIFICATIONS,
      baseFlags.sendNotifications
    ),
  };
}

/**
 * Create feature flags from partial overrides
 */
export function createFeatureFlags(overrides: Partial<FeatureFlags> = {}): FeatureFlags {
  return {
    ...DEFAULT_FEATURE_FLAGS,
    ...overrides,
  };
}

/**
 * Log feature flags for debugging
 */
export function logFeatureFlags(flags: FeatureFlags): void {
  console.log("Feature Flags Configuration:");
  console.log("============================");
  Object.entries(flags).forEach(([key, value]) => {
    const status = value ? "✓ ENABLED" : "✗ DISABLED";
    console.log(`  ${key}: ${status}`);
  });
  console.log("============================");
}

