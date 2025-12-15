import { ethers } from "ethers";
import { config, Config } from "../../config";
import { REWARD_DISTRIBUTOR_ABI } from "../../abis/REWARD_DISTRIBUTOR_ABI";

/**
 * Supported token types for reward distribution
 */
export type RewardToken = "KITE" | "OP" | "DINERO" | "HAI";

/**
 * Get the token address mapping from config
 */
export function getTokenAddressMap(cfg: Config = config()): Record<RewardToken, string> {
  return {
    KITE: cfg.KITE_ADDRESS,
    OP: cfg.OP_ADDRESS,
    DINERO: cfg.DINERO_ADDRESS,
    HAI: cfg.HAI_ADDRESS,
  };
}

/**
 * Get token address by symbol
 */
export function getTokenAddress(token: string, cfg: Config = config()): string | undefined {
  const map = getTokenAddressMap(cfg);
  return map[token.toUpperCase() as RewardToken];
}

/**
 * Contract connection helper - creates provider, signer, and contract instance
 */
export interface ContractConnection {
  provider: ethers.providers.JsonRpcProvider;
  signer: ethers.Wallet;
  rewardDistributor: ethers.Contract;
}

/**
 * Create a connection to the reward distributor contract
 */
export function createContractConnection(cfg: Config = config()): ContractConnection {
  const provider = new ethers.providers.JsonRpcProvider(cfg.DISTRIBUTOR_RPC_URL);
  const signer = new ethers.Wallet(cfg.REWARD_SETTER_PRIVATE_KEY, provider);
  const rewardDistributor = new ethers.Contract(
    cfg.REWARD_DISTRIBUTOR_ADDRESS,
    REWARD_DISTRIBUTOR_ABI,
    signer
  );

  return { provider, signer, rewardDistributor };
}

/**
 * Check if the reward distributor is paused
 */
export async function isContractPaused(
  rewardDistributor: ethers.Contract
): Promise<boolean> {
  return await rewardDistributor.paused();
}

/**
 * Get the current epoch counter from the contract
 */
export async function getEpochCounter(
  rewardDistributor: ethers.Contract
): Promise<number> {
  return Number(String(await rewardDistributor.epochCounter()));
}

/**
 * Multiply config values by a multiplier (used for epoch-based reward scaling)
 * This is the unified version of the duplicate multiplyLPConfigValues and multiplyHaiveloConfigValues
 */
export function multiplyConfigValues(
  configObj: Record<string, number>,
  multiplier: number
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [token, amount] of Object.entries(configObj)) {
    result[token] = amount * multiplier;
  }
  return result;
}

/**
 * Prepare block numbers with delay for subgraph indexing
 */
export interface BlockNumbersConfig {
  lpEndBlock: number;
  minterEndBlock: number;
  haiveloEndBlock: number;
}

/**
 * Get current block numbers from providers with indexing delay
 */
export async function getBlockNumbersWithDelay(
  lpProvider: ethers.providers.Provider,
  minterProvider: ethers.providers.Provider,
  haiveloProvider: ethers.providers.Provider,
  delay: number = 30
): Promise<BlockNumbersConfig> {
  const [lpBlock, minterBlock, haiveloBlock] = await Promise.all([
    lpProvider.getBlockNumber(),
    minterProvider.getBlockNumber(),
    haiveloProvider.getBlockNumber(),
  ]);

  return {
    lpEndBlock: lpBlock - delay,
    minterEndBlock: minterBlock - delay,
    haiveloEndBlock: haiveloBlock - delay,
  };
}

