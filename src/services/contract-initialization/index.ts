/**
 * Service for initializing blockchain contracts and connections
 */

import { ethers } from 'ethers';
import { config } from '../../config';
import { REWARD_DISTRIBUTOR_ABI } from '../../abis/REWARD_DISTRIBUTOR_ABI';

export interface ContractInstances {
  provider: ethers.providers.JsonRpcProvider;
  signer: ethers.Wallet;
  rewardDistributor: ethers.Contract;
}

/**
 * Initializes the blockchain provider, signer, and reward distributor contract
 * @returns Promise that resolves to the initialized contract instances
 */
export async function initializeContracts(): Promise<ContractInstances> {
  const cfg = config();

  const provider = new ethers.providers.JsonRpcProvider(
    cfg.DISTRIBUTOR_RPC_URL
  );
  
  const signer = new ethers.Wallet(cfg.REWARD_SETTER_PRIVATE_KEY, provider);

  // Get contract instance
  const rewardDistributor = new ethers.Contract(
    cfg.REWARD_DISTRIBUTOR_ADDRESS,
    REWARD_DISTRIBUTOR_ABI,
    signer
  );

  return {
    provider,
    signer,
    rewardDistributor
  };
} 