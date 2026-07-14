import path from "path";
import { config as dotenv } from "dotenv";
import {
  LpStakingRewardWindow,
  LpStakingType,
  MinterRewardWindow,
  RewardConfig,
  TimedMinterRewardConfig,
  TokenType,
} from "./types";
import { validateTimedMinterConfig } from "../utils/minter-config-resolver";

dotenv();

const parseRewardConfig = (configStr: string): any => {
  try {
    return JSON.parse(configStr);
  } catch (error) {
    console.error("Error parsing reward config:", error);
    throw new Error("Invalid reward config format");
  }
};

const parseCollateralTypes = (typesStr: string): TokenType[] => {
  try {
    const types = JSON.parse(typesStr);
    return types as TokenType[];
  } catch (error) {
    console.error("Error parsing collateral types:", error);
    throw new Error("Invalid collateral types format");
  }
};

const parseStringArray = (
  typesStr: string | undefined,
  fallback: string[]
): string[] => {
  try {
    if (!typesStr) return fallback;
    const types = JSON.parse(typesStr);
    return Array.isArray(types) ? (types as string[]) : fallback;
  } catch (error) {
    console.error("Error parsing string array:", error);
    return fallback;
  }
};

const parseTimedMinterRewardConfig = (
  configStr: string | undefined
): TimedMinterRewardConfig | undefined => {
  if (!configStr) {
    return undefined;
  }

  try {
    const timedConfig = JSON.parse(configStr) as TimedMinterRewardConfig;

    const validationErrors = validateTimedMinterConfig(timedConfig);
    if (validationErrors.length > 0) {
      console.error("Time-based minter config validation errors:", validationErrors);
      throw new Error(
        `Invalid time-based minter config: ${validationErrors.join(", ")}`
      );
    }

    return timedConfig;
  } catch (error) {
    console.error("Error parsing time-based minter reward config:", error);
    throw new Error("Invalid time-based minter reward config format");
  }
};

const parseMinterWindows = (windowsStr: string | undefined): MinterRewardWindow[] => {
  if (!windowsStr) return [];
  try {
    const raw = JSON.parse(windowsStr);
    if (!Array.isArray(raw)) throw new Error("REWARD_MINTER_WINDOWS must be an array");
    return raw.map((w) => {
      const startBlock = Number(w.startBlock);
      const endBlock = w.endBlock !== undefined && w.endBlock !== null ? Number(w.endBlock) : undefined;
      const config = w.config;
      if (!Number.isFinite(startBlock)) {
        throw new Error("Invalid startBlock in REWARD_MINTER_WINDOWS");
      }
      if (endBlock !== undefined && !Number.isFinite(endBlock)) {
        throw new Error("Invalid endBlock in REWARD_MINTER_WINDOWS");
      }
      if (!config || typeof config !== 'object') {
        throw new Error("Invalid config in REWARD_MINTER_WINDOWS item");
      }
      const mode = w.mode as MinterRewardWindow['mode'];
      if (mode && mode !== 'fixed' && mode !== 'dynamic') {
        throw new Error(`Invalid mode "${mode}" in REWARD_MINTER_WINDOWS item`);
      }
      return { startBlock, endBlock, ...(mode ? { mode } : {}), config } as MinterRewardWindow;
    });
  } catch (error) {
    console.error("Error parsing minter windows:", error);
    throw new Error("Invalid REWARD_MINTER_WINDOWS format");
  }
};

const parseLpStakingWindows = (windowsStr: string | undefined): LpStakingRewardWindow[] => {
  if (!windowsStr) return [];
  try {
    const raw = JSON.parse(windowsStr);
    if (!Array.isArray(raw)) throw new Error("REWARD_LP_STAKING_WINDOWS must be an array");
    return raw.map((w) => {
      const startBlock = Number(w.startBlock);
      const endBlock = w.endBlock !== undefined && w.endBlock !== null ? Number(w.endBlock) : undefined;
      const config = w.config;
      if (!Number.isFinite(startBlock)) {
        throw new Error("Invalid startBlock in REWARD_LP_STAKING_WINDOWS");
      }
      if (endBlock !== undefined && !Number.isFinite(endBlock)) {
        throw new Error("Invalid endBlock in REWARD_LP_STAKING_WINDOWS");
      }
      if (!config || typeof config !== 'object') {
        throw new Error("Invalid config in REWARD_LP_STAKING_WINDOWS item");
      }
      return { startBlock, endBlock, config } as LpStakingRewardWindow;
    });
  } catch (error) {
    console.error("Error parsing LP staking windows:", error);
    throw new Error("Invalid REWARD_LP_STAKING_WINDOWS format");
  }
};

const parseLpStakingTypes = (typesStr: string | undefined): LpStakingType[] => {
  if (!typesStr) return ['HAI_BOLD_CURVE', 'HAI_VELO_VELO'];
  try {
    const types = JSON.parse(typesStr);
    return types as LpStakingType[];
  } catch (error) {
    console.error("Error parsing LP staking types:", error);
    return ['HAI_BOLD_CURVE', 'HAI_VELO_VELO'];
  }
};

export const config = () => {
  const envs = process.env as any;
  const timedMinterConfig = parseTimedMinterRewardConfig(
    envs.REWARD_MINTER_TIMED_CONFIG
  );

  // Parse reward configurations
  const rewardConfig: RewardConfig = {
    minter: {
      config: parseRewardConfig(envs.REWARD_MINTER_CONFIG),
      timedConfig: timedMinterConfig,
      collateralTypes: parseCollateralTypes(
        envs.REWARD_MINTER_COLLATERAL_TYPES
      ),
      windows: [],
    },
    lp: {
      config: parseRewardConfig(envs.REWARD_LP_CONFIG),
      historicConfig: parseRewardConfig(envs.REWARD_LP_HISTORIC_CONFIG),
      collateralTypes: parseCollateralTypes(envs.REWARD_LP_COLLATERAL_TYPES),
    },
    haiVelo: {
      historicConfig: parseRewardConfig(envs.REWARD_HAIVELO_HISTORIC_CONFIG),
      config: parseRewardConfig(envs.REWARD_HAIVELO_CONFIG || "{}"),
    },
    haiAero: {
      config: parseRewardConfig(envs.REWARD_HAIAERO_CONFIG || "{}"),
    },
    lpStaking: {
      config: parseRewardConfig(envs.REWARD_LP_STAKING_CONFIG || "{}"),
      stakingTypes: parseLpStakingTypes(envs.REWARD_LP_STAKING_TYPES),
      windows: [],
    },
  };

  // Populate minter windows (multi-window support with backward compatibility)
  // Note: endBlock is left undefined if not explicitly set - the calculation module
  // will fetch the latest block from RPC when endBlock is undefined
  const minterWindows = parseMinterWindows(envs.REWARD_MINTER_WINDOWS);
  if (minterWindows.length > 0) {
    rewardConfig.minter.windows = minterWindows;
  } else if (timedMinterConfig) {
    rewardConfig.minter.windows = timedMinterConfig.periods.map((period) => ({
      startBlock: period.fromBlock,
      endBlock: period.toBlock,
      config: period.config,
    }));
  } else {
    const fallbackStart = Number(envs.MINTER_START_BLOCK) ? Number(envs.MINTER_START_BLOCK) : Number(envs.START_BLOCK);
    // Only set endBlock if explicitly configured, otherwise leave undefined for latest block fetch
    const fallbackEnd = Number(envs.MINTER_END_BLOCK) ? Number(envs.MINTER_END_BLOCK) : undefined;
    rewardConfig.minter.windows = [
      {
        startBlock: fallbackStart,
        endBlock: fallbackEnd,
        config: rewardConfig.minter.config,
      },
    ];
  }

  // Populate LP staking windows (multi-window support with backward compatibility)
  // Note: endBlock is left undefined if not explicitly set - the calculation module
  // will fetch the latest block from RPC when endBlock is undefined
  const lpStakingWindows = parseLpStakingWindows(envs.REWARD_LP_STAKING_WINDOWS);
  if (lpStakingWindows.length > 0) {
    rewardConfig.lpStaking.windows = lpStakingWindows;
  } else if (Object.keys(rewardConfig.lpStaking.config).length > 0) {
    const fallbackStart = Number(envs.LP_STAKING_START_BLOCK) ? Number(envs.LP_STAKING_START_BLOCK) : Number(envs.START_BLOCK);
    // Only set endBlock if explicitly configured, otherwise leave undefined for latest block fetch
    const fallbackEnd = Number(envs.LP_STAKING_END_BLOCK) ? Number(envs.LP_STAKING_END_BLOCK) : undefined;
    rewardConfig.lpStaking.windows = [
      {
        startBlock: fallbackStart,
        endBlock: fallbackEnd,
        config: rewardConfig.lpStaking.config,
      },
    ];
  }

  return {
    // Subgraph URLs
    GEB_SUBGRAPH_URL: envs.GEB_SUBGRAPH_URL,
    LP_GEB_SUBGRAPH_URL: envs.LP_GEB_SUBGRAPH_URL
      ? envs.LP_GEB_SUBGRAPH_URL
      : envs.GEB_SUBGRAPH_URL,
    MINTER_GEB_SUBGRAPH_URL: envs.MINTER_GEB_SUBGRAPH_URL
      ? envs.MINTER_GEB_SUBGRAPH_URL
      : envs.GEB_SUBGRAPH_URL,
    UNISWAP_SUBGRAPH_URL: envs.UNISWAP_SUBGRAPH_URL,
    UNISWAP_POSITIONS_SUBGRAPH_URL:
      envs.UNISWAP_POSITIONS_SUBGRAPH_URL || envs.UNISWAP_SUBGRAPH_URL,
    UNISWAP_SWAPS_SUBGRAPH_URL:
      envs.UNISWAP_SWAPS_SUBGRAPH_URL || envs.UNISWAP_SUBGRAPH_URL,
    STKITE_SUBGRAPH_URL: envs.STKITE_SUBGRAPH_URL,
    HAIVELO_SUBGRAPH_URL: envs.HAIVELO_SUBGRAPH_URL,
    LP_STAKING_SUBGRAPH_URL: envs.LP_STAKING_SUBGRAPH_URL
      ? envs.LP_STAKING_SUBGRAPH_URL
      : envs.GEB_SUBGRAPH_URL,
    // haiVELO-VELO LP Pool Indexer URL
    HAIVELO_VELO_LP_INDEXER: envs.HAIVELO_VELO_LP_INDEXER,
    HAIVELO_COLLATERAL_TYPE_IDS: parseStringArray(
      envs.HAIVELO_COLLATERAL_TYPE_IDS,
      ["HAIVELO", "HAIVELOV2"]
    ),
    // haiVELO feature flags (default to true for backward compatibility)
    HAIVELO_COLLATERAL_ENABLED: envs.HAIVELO_COLLATERAL_ENABLED !== 'false',
    HAIVELO_LP_STAKING_ENABLED: envs.HAIVELO_LP_STAKING_ENABLED !== 'false',

    // Liquidation events (confiscations & transfers)
    // Set LIQUIDATION_EVENTS_ENABLED=true to include confiscation/transfer events
    // LIQUIDATION_EVENTS_EFFECTIVE_BLOCK + _TIMESTAMP override all confiscation/transfer
    // timestamps so they take effect at a single point rather than at their original times
    LIQUIDATION_EVENTS_ENABLED: envs.LIQUIDATION_EVENTS_ENABLED === 'true',
    LIQUIDATION_EVENTS_EFFECTIVE_BLOCK: Number(envs.LIQUIDATION_EVENTS_EFFECTIVE_BLOCK) || 0,
    LIQUIDATION_EVENTS_EFFECTIVE_TIMESTAMP: Number(envs.LIQUIDATION_EVENTS_EFFECTIVE_TIMESTAMP) || 0,

    // haiAERO Configuration
    HAIAERO_REWARDS_ENABLED: envs.HAIAERO_REWARDS_ENABLED !== 'false',
    DEBUG_HAIAERO:
      String(envs.DEBUG_HAIAERO).toLowerCase() === 'true' ||
      String(envs.DEBUG_HAIAERO) === '1',
    HAIAERO_SUBGRAPH_URL: envs.HAIAERO_SUBGRAPH_URL
      ? envs.HAIAERO_SUBGRAPH_URL
      : envs.HAIVELO_SUBGRAPH_URL,
    HAIAERO_COLLATERAL_TYPE_IDS: parseStringArray(
      envs.HAIAERO_COLLATERAL_TYPE_IDS,
      ["HAIAERO"]
    ),
    HAIAERO_START_BLOCK: Number(envs.HAIAERO_START_BLOCK)
      ? Number(envs.HAIAERO_START_BLOCK)
      : Number(envs.HAIVELO_START_BLOCK),
    HAIAERO_END_BLOCK: Number(envs.HAIAERO_END_BLOCK)
      ? Number(envs.HAIAERO_END_BLOCK)
      : Number(envs.HAIVELO_END_BLOCK),
    HAIAERO_DEPOSIT_SENDER_ADDRESS: envs.HAIAERO_DEPOSIT_SENDER_ADDRESS,
    HAIAERO_DEPOSIT_TOKEN_ADDRESS: envs.HAIAERO_DEPOSIT_TOKEN_ADDRESS,

    // Contract Addresses
    UNISWAP_POOL_ADDRESS: envs.UNISWAP_POOL_ADDRESS.toLowerCase(),
    STANDARD_BRIDGE_ADDRESS: envs.STANDARD_BRIDGE_ADDRESS,
    LZ_EXECUTOR_ADDRESS: envs.LZ_EXECUTOR_ADDRESS,
    CROSS_DOMAIN_MESSENGER_ADDRESS: envs.CROSS_DOMAIN_MESSENGER_ADDRESS,
    APX_ETH_ADDRESS: envs.APX_ETH_ADDRESS,
    RETH_CONTRACT_ADDRESS: envs.RETH_CONTRACT_ADDRESS,
    WSTETH_CONTRACT_ADDRESS: envs.WSTETH_CONTRACT_ADDRESS,
    HOP_PROTOCOL_RETH_WRAPPER: envs.HOP_PROTOCOL_RETH_WRAPPER,

    // Network Configuration
    RPC_URL: envs.RPC_URL,
    LP_RPC_URL: envs.LP_RPC_URL ? envs.LP_RPC_URL : envs.RPC_URL,
    MINTER_RPC_URL: envs.MINTER_RPC_URL ? envs.MINTER_RPC_URL : envs.RPC_URL,
    HAIVELO_RPC_URL: envs.HAIVELO_RPC_URL ? envs.HAIVELO_RPC_URL : envs.RPC_URL,
    LP_STAKING_RPC_URL: envs.LP_STAKING_RPC_URL ? envs.LP_STAKING_RPC_URL : envs.RPC_URL,
    CHAIN_ID: envs.CHAIN_ID || "optimism-mainnet",

    // Blocks and Rewards
    START_BLOCK: Number(envs.START_BLOCK),
    END_BLOCK: Number(envs.END_BLOCK),

    LP_HISTORIC_START_BLOCK: Number(envs.LP_HISTORIC_START_BLOCK)
      ? Number(envs.LP_HISTORIC_START_BLOCK)
      : Number(envs.HISTORIC_BLCOK),
    LP_START_BLOCK: Number(envs.LP_START_BLOCK)
      ? Number(envs.LP_START_BLOCK)
      : Number(envs.START_BLOCK),
    LP_END_BLOCK: Number(envs.LP_END_BLOCK)
      ? Number(envs.LP_END_BLOCK)
      : Number(envs.END_BLOCK),

    MINTER_START_BLOCK: Number(envs.MINTER_START_BLOCK)
      ? Number(envs.MINTER_START_BLOCK)
      : Number(envs.START_BLOCK),
    // MINTER_END_BLOCK: undefined means "use latest block from RPC"
    MINTER_END_BLOCK: Number(envs.MINTER_END_BLOCK) || undefined,

    HAIVELO_HISTORIC_START_BLOCK: Number(envs.LP_HISTORIC_START_BLOCK)
      ? Number(envs.LP_HISTORIC_START_BLOCK)
      : Number(envs.HISTORIC_BLCOK),
    HAIVELO_START_BLOCK: Number(envs.HAIVELO_START_BLOCK)
      ? Number(envs.HAIVELO_START_BLOCK)
      : Number(envs.START_BLOCK),
    HAIVELO_END_BLOCK: Number(envs.HAIVELO_END_BLOCK)
      ? Number(envs.HAIVELO_END_BLOCK)
      : Number(envs.END_BLOCK),

    LP_STAKING_START_BLOCK: Number(envs.LP_STAKING_START_BLOCK)
      ? Number(envs.LP_STAKING_START_BLOCK)
      : Number(envs.START_BLOCK),
    // LP_STAKING_END_BLOCK: undefined means "use latest block from RPC"
    LP_STAKING_END_BLOCK: Number(envs.LP_STAKING_END_BLOCK) || undefined,

    REWARD_AMOUNT: Number(envs.REWARD_AMOUNT),
    REWARD_TOKEN: envs.REWARD_TOKEN,

    // Lists and Files
    COLLATERAL_TYPES: JSON.parse(
      envs.REWARD_MINTER_COLLATERAL_TYPES
    ) as TokenType[], // ["RETH", "WSTETH", "APXETH"] as TokenType[],
    PLACEHOLDER_COLLATERAL_TYPES: ['HAIVELO'] as TokenType[],
    LP_COLLATERAL_TYPES: ['OP', 'WETH', 'WSTETH'] as TokenType[],
    EXCLUSION_LIST_FILE: path.join(__dirname, '..', '..', 'exclusion-list.csv'),
    CLAIM_ADJUSTMENTS_FILE: envs.CLAIM_ADJUSTMENTS_FILE
      ? path.isAbsolute(envs.CLAIM_ADJUSTMENTS_FILE)
        ? envs.CLAIM_ADJUSTMENTS_FILE
        : path.join(__dirname, '..', '..', envs.CLAIM_ADJUSTMENTS_FILE)
      : undefined,

    // API Keys
    COVALENT_API_KEY: envs.COVALENT_API_KEY,

    // Reward Configurations
    rewards: rewardConfig,

    // Debugging
    DEBUG_REWARDS:
      String(envs.DEBUG_REWARDS).toLowerCase() === 'true' ||
      String(envs.DEBUG_REWARDS) === '1' ||
      String(envs.DEBUG).toLowerCase() === 'true' ||
      String(envs.DEBUG) === '1',
    DEBUG_OUTPUT_DIR: envs.DEBUG_OUTPUT_DIR
      ? path.isAbsolute(envs.DEBUG_OUTPUT_DIR)
        ? envs.DEBUG_OUTPUT_DIR
        : path.join(__dirname, '..', '..', envs.DEBUG_OUTPUT_DIR)
      : path.join(__dirname, '..', '..', 'debug-data'),

    // Cloudflare Configuration
    CLOUDFLARE_ACCOUNT_ID: envs.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_NAMESPACE_ID: envs.CLOUDFLARE_NAMESPACE_ID,
    CLOUDFLARE_API_TOKEN: envs.CLOUDFLARE_API_TOKEN,

    // Wallet Addresses
    REWARD_SETTER_ADDRESS: envs.REWARD_SETTER_ADDRESS,
    REWARD_SETTER_PRIVATE_KEY: envs.REWARD_SETTER_PRIVATE_KEY,

    // Chain Config
    DISTRIBUTOR_RPC_URL: envs.DISTRIBUTOR_RPC_URL
      ? envs.DISTRIBUTOR_RPC_URL
      : envs.RPC_URL,

    // Contract Addresses
    REWARD_DISTRIBUTOR_ADDRESS: envs.REWARD_DISTRIBUTOR_ADDRESS,
    KITE_ADDRESS: envs.KITE_ADDRESS,
    OP_ADDRESS: envs.OP_ADDRESS,
    DINERO_ADDRESS: envs.DINERO_ADDRESS,
    HAI_ADDRESS: envs.HAI_ADDRESS,
    
    DISTRIBUTOR_SUBGRAPH_URL: envs.DISTRIBUTOR_SUBGRAPH_URL,

    // Reward Distributor Deposits Service
    ALCHEMY_API_KEY: envs.ALCHEMY_API_KEY,
    DEPOSIT_CONTRACT_ADDRESS: envs.DEPOSIT_CONTRACT_ADDRESS,
    DEPOSIT_SENDER_ADDRESS: envs.DEPOSIT_SENDER_ADDRESS,
    DEPOSIT_TOKEN_ADDRESS: envs.DEPOSIT_TOKEN_ADDRESS,

    IGNORE_BRIDGE: true,

    // Telegram Bot Configuration
    TELEGRAM_BOT_TOKEN: envs.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_STORAGE_FILE: envs.TELEGRAM_CHAT_STORAGE_FILE || path.join(__dirname, "..", "..", "telegram-users.json"),
  };
};

// Add type for the complete config
export type Config = ReturnType<typeof config>;
