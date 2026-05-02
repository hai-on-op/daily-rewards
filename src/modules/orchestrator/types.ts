import { ethers } from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { RewardsMap } from "../result-combiner";
import { RootUpdateManifest } from "../../services/ops-state";

/**
 * Feature flags for controlling which steps of the reward distribution process are executed.
 * This allows for environment-specific configuration (dev vs production) without code changes.
 */
export interface FeatureFlags {
  /** Initialize Telegram bot for notifications */
  initTelegram: boolean;
  /** Pause the reward distributor contract before processing */
  pauseContract: boolean;
  /** Handle initial epoch setup if counter is 0 */
  handleInitialEpoch: boolean;
  /** Prepare block numbers and multiply configs by epoch counter */
  prepareConfig: boolean;
  /** Calculate rewards from all sources (LP, Minter, HaiVelo, etc.) */
  calculateRewards: boolean;
  /** Generate merkle trees from calculated rewards */
  generateMerkleTrees: boolean;
  /** Update merkle roots on the blockchain */
  updateOnChain: boolean;
  /** Save merkle tree backups to local filesystem */
  saveBackups: boolean;
  /** Upload merkle trees to Cloudflare KV */
  uploadToCloudflare: boolean;
  /** Send Telegram notifications for operations */
  sendNotifications: boolean;
}

/**
 * Merkle tree data for a single token
 */
export interface MerkleTreeData {
  token: string;
  tree: StandardMerkleTree<[string, string]>;
  root: string;
}

/**
 * Processing context passed between steps.
 * Each step can read from and write to this context.
 */
export interface ProcessingContext {
  /** Feature flags controlling step execution */
  flags: FeatureFlags;
  /** Current epoch counter from contract */
  entryCounter: number;
  /** Effective entry counter (entryCounter - 1 for rewards calculation) */
  effectiveEntryCounter: number;
  /** Ethers provider for blockchain interactions */
  provider: ethers.providers.JsonRpcProvider;
  /** Ethers signer for transactions */
  signer: ethers.Wallet;
  /** Reward distributor contract instance */
  rewardDistributor: ethers.Contract;
  /** Whether the contract was paused at the start */
  wasContractPaused: boolean;
  /** Block numbers for different chains */
  blockNumbers: {
    lp: number;
    minter: number;
    haivelo: number;
  };
  /** Combined rewards from all sources */
  rewards: RewardsMap | null;
  /** Adjusted rewards with BigNumber values */
  adjustedRewards: { [token: string]: { address: string; earned: string }[] } | null;
  /** Final rewards after subtracting claims */
  finalRewards: { [token: string]: { address: string; earned: string }[] } | null;
  /** Generated merkle trees by token */
  merkleTrees: { [token: string]: StandardMerkleTree<[string, string]> } | null;
  /** Any errors that occurred during processing */
  errors: Error[];
  /** Durable manifest for production root-update runs */
  runManifest: RootUpdateManifest | null;
}

/**
 * Interface for a processing step in the reward distribution pipeline.
 * Each step is responsible for a single concern and can be enabled/disabled via feature flags.
 */
export interface ProcessingStep {
  /** Name of the step for logging and identification */
  readonly name: string;
  
  /**
   * Check if this step should be executed based on feature flags
   */
  isEnabled(flags: FeatureFlags): boolean;
  
  /**
   * Execute the step, modifying the context as needed
   * @returns Updated context
   */
  execute(context: ProcessingContext): Promise<ProcessingContext>;
}

/**
 * Default feature flags for production environment
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  initTelegram: true,
  pauseContract: true,
  handleInitialEpoch: true,
  prepareConfig: true,
  calculateRewards: true,
  generateMerkleTrees: true,
  updateOnChain: true,
  saveBackups: true,
  uploadToCloudflare: true,
  sendNotifications: true,
};

/**
 * Feature flags for development/testing - minimal operations
 */
export const DEV_FEATURE_FLAGS: FeatureFlags = {
  initTelegram: false,
  pauseContract: false,
  handleInitialEpoch: false,
  prepareConfig: true,
  calculateRewards: true,
  generateMerkleTrees: true,
  updateOnChain: false,
  saveBackups: true,
  uploadToCloudflare: false,
  sendNotifications: false,
};

/**
 * Feature flags for dry-run mode - calculate but don't persist
 */
export const DRY_RUN_FEATURE_FLAGS: FeatureFlags = {
  initTelegram: false,
  pauseContract: false,
  handleInitialEpoch: false,
  prepareConfig: true,
  calculateRewards: true,
  generateMerkleTrees: true,
  updateOnChain: false,
  saveBackups: false,
  uploadToCloudflare: false,
  sendNotifications: false,
};
