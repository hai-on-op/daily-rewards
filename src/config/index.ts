import path from "path";
import { config as dotenv } from "dotenv";
import { RewardConfig, TokenType } from "./types";

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

export const config = () => {
  const envs = process.env as any;

  // Parse reward configurations
  const rewardConfig: RewardConfig = {
    minter: {
      config: parseRewardConfig(envs.REWARD_MINTER_CONFIG),
      collateralTypes: parseCollateralTypes(
        envs.REWARD_MINTER_COLLATERAL_TYPES
      ),
    },
    lp: {
      config: parseRewardConfig(envs.REWARD_LP_CONFIG),
      collateralTypes: parseCollateralTypes(envs.REWARD_LP_COLLATERAL_TYPES),
    },
  };

  return {
    // Subgraph URLs
    GEB_SUBGRAPH_URL: envs.GEB_SUBGRAPH_URL,
    UNISWAP_SUBGRAPH_URL: envs.UNISWAP_SUBGRAPH_URL,

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
    CHAIN_ID: envs.CHAIN_ID || "optimism-mainnet",

    // Blocks and Rewards
    START_BLOCK: Number(envs.START_BLOCK),
    END_BLOCK: Number(envs.END_BLOCK),
    REWARD_AMOUNT: Number(envs.REWARD_AMOUNT),
    REWARD_TOKEN: envs.REWARD_TOKEN,

    // Lists and Files
    COLLATERAL_TYPES: ["RETH", "WSTETH", "APXETH"] as TokenType[],
    LP_COLLATERAL_TYPES: ["OP", "WETH", "WSTETH"] as TokenType[],
    EXCLUSION_LIST_FILE: path.join(__dirname, "..", "..", "exclusion-list.csv"),

    // API Keys
    COVALENT_API_KEY: envs.COVALENT_API_KEY,

    // Reward Configurations
    rewards: rewardConfig,

    // Cloudflare Configuration
    CLOUDFLARE_ACCOUNT_ID: envs.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_NAMESPACE_ID: envs.CLOUDFLARE_NAMESPACE_ID,
    CLOUDFLARE_API_TOKEN: envs.CLOUDFLARE_API_TOKEN,
  };
};

// Add type for the complete config
export type Config = ReturnType<typeof config>;
