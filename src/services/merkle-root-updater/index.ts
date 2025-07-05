/**
 * Service for updating merkle roots on-chain with automatic notifications
 */

import { ethers } from 'ethers';
import { config } from '../../config';
import { REWARD_DISTRIBUTOR_ABI } from '../../abis/REWARD_DISTRIBUTOR_ABI';
import { executeContractMethodWithNotifications } from '../transaction-handler';
import { notifyMerkleUpdate } from '../../modules/telegram-bot';

export interface MerkleTree {
  root: string;
  dump: () => any;
}

export interface MerkleRootsData {
  [token: string]: MerkleTree;
}

export interface TokenAddressMap {
  KITE: string;
  OP: string;
  DINERO: string;
  HAI: string;
}

export interface UpdateMerkleRootsOptions {
  merkleTries: MerkleRootsData;
  rewardDistributor: ethers.Contract;
}

/**
 * Updates merkle roots on-chain with automatic notification handling
 * @param options - Configuration options for the merkle root update
 * @returns Promise that resolves when the update is complete
 */
export async function updateMerkleRootsWithNotifications(
  options: UpdateMerkleRootsOptions
): Promise<void> {
  const { merkleTries, rewardDistributor } = options;
  const cfg = config();

  // Map token names to addresses
  const tokenAddressMap: TokenAddressMap = {
    KITE: cfg.KITE_ADDRESS,
    OP: cfg.OP_ADDRESS,
    DINERO: cfg.DINERO_ADDRESS,
    HAI: cfg.HAI_ADDRESS
  };

  // Prepare arrays for updateMerkleRoots
  const tokenAddresses: string[] = [];
  const roots: string[] = [];
  const validTokens: string[] = [];

  // Build arrays for the contract call
  for (const [token, tree] of Object.entries(merkleTries)) {
    const tokenAddress = tokenAddressMap[token as keyof TokenAddressMap];
    if (!tokenAddress) {
      console.warn(`No address found for token: ${token}`);
      continue;
    }

    tokenAddresses.push(tokenAddress);
    roots.push(tree.root);
    validTokens.push(token);
    console.log(`Merkle root for ${token} (${tokenAddress}):`, tree.root);
  }

  if (tokenAddresses.length === 0) {
    console.warn('No valid token addresses found for merkle root update');
    return;
  }

  // Execute the transaction with notifications
  await executeContractMethodWithNotifications(
    rewardDistributor,
    'updateMerkleRoots',
    [tokenAddresses, roots],
    {
      operation: 'Update Merkle Roots',
      details: {
        tokens: validTokens,
        tokenAddresses,
        tokenCount: tokenAddresses.length
      },
      successDetails: {
        tokens: validTokens
      }
    }
  );

  // Send merkle update notification after successful transaction
  await notifyMerkleUpdate(validTokens, roots);
}