import path from "path";
import { config as dotenv } from "dotenv";
import { MinterRewardWindow, RewardConfig, TokenType } from "./types";

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
      return { startBlock, endBlock, config } as MinterRewardWindow;
    });
  } catch (error) {
    console.error("Error parsing minter windows:", error);
    throw new Error("Invalid REWARD_MINTER_WINDOWS format");
  }
};

export const config = () => {
  const envs = process.env as any;

  // Parse reward configurations
  const rewardConfig: RewardConfig = {
    minter: {
      config: parseRewardConfig(envs.REWARD_MINTER_CONFIG),
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
  };

  // Populate minter windows (multi-window support with backward compatibility)
  const minterWindows = parseMinterWindows(envs.REWARD_MINTER_WINDOWS);
  if (minterWindows.length > 0) {
    rewardConfig.minter.windows = minterWindows;
  } else {
    const fallbackStart = Number(envs.MINTER_START_BLOCK) ? Number(envs.MINTER_START_BLOCK) : Number(envs.START_BLOCK);
    const fallbackEnd = Number(envs.MINTER_END_BLOCK) ? Number(envs.MINTER_END_BLOCK) : Number(envs.END_BLOCK);
    rewardConfig.minter.windows = [
      {
        startBlock: fallbackStart,
        endBlock: fallbackEnd,
        config: rewardConfig.minter.config,
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
    STKITE_SUBGRAPH_URL: envs.STKITE_SUBGRAPH_URL,
    HAIVELO_SUBGRAPH_URL: envs.HAIVELO_SUBGRAPH_URL,

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
    MINTER_END_BLOCK: Number(envs.MINTER_END_BLOCK)
      ? Number(envs.MINTER_END_BLOCK)
      : Number(envs.END_BLOCK),

    HAIVELO_HISTORIC_START_BLOCK: Number(envs.LP_HISTORIC_START_BLOCK)
      ? Number(envs.LP_HISTORIC_START_BLOCK)
      : Number(envs.HISTORIC_BLCOK),
    HAIVELO_START_BLOCK: Number(envs.HAIVELO_START_BLOCK)
      ? Number(envs.HAIVELO_START_BLOCK)
      : Number(envs.START_BLOCK),
    HAIVELO_END_BLOCK: Number(envs.HAIVELO_END_BLOCK)
      ? Number(envs.HAIVELO_END_BLOCK)
      : Number(envs.END_BLOCK),

    // haiVELO collateral type ids to aggregate (e.g., ["HAIVELO","HAIVELO_V2"]) 
    HAIVELO_COLLATERAL_IDS: (() => {
      try {
        return envs.HAIVELO_COLLATERAL_IDS
          ? (JSON.parse(envs.HAIVELO_COLLATERAL_IDS) as string[])
          : ["HAIVELO"]; // default to v1 only if not provided
      } catch (e) {
        console.error("Error parsing HAIVELO_COLLATERAL_IDS; falling back to ['HAIVELO']", e);
        return ["HAIVELO"]; 
      }
    })(),

    REWARD_AMOUNT: Number(envs.REWARD_AMOUNT),
    REWARD_TOKEN: envs.REWARD_TOKEN,

    // Lists and Files
    COLLATERAL_TYPES: JSON.parse(
      envs.REWARD_MINTER_COLLATERAL_TYPES
    ) as TokenType[], // ["RETH", "WSTETH", "APXETH"] as TokenType[],
    PLACEHOLDER_COLLATERAL_TYPES: ['HAIVELO'] as TokenType[],
    LP_COLLATERAL_TYPES: ['OP', 'WETH', 'WSTETH'] as TokenType[],
    EXCLUSION_LIST_FILE: path.join(__dirname, '..', '..', 'exclusion-list.csv'),

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
