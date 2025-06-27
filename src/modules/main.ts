import { combineResults } from './result-combiner';
import { ethers } from 'ethers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import * as fs from 'fs';
import * as path from 'path';

import { uploadMerkleTree } from './upload-merkle-tree';
import { config } from '../config';
import { subgraphQuery } from '../services/subgraph/utils';
import {
  notifyTransaction,
  notifyMerkleUpdate,
  TransactionNotification
} from './telegram-bot';

import { REWARD_DISTRIBUTOR_ABI } from '../abis/REWARD_DISTRIBUTOR_ABI';

async function getClaimedAmounts(
  token: string,
  users: string[]
): Promise<Map<string, string>> {
  users.map(u => {
    console.log(u, token);
    return u?.toLowerCase();
  });

  const query = `
    {
      tokenClaims(where: {
        token: "${token.toLowerCase()}"
        user_in: ${JSON.stringify(users.map(u => u?.toLowerCase()))}
      }) {
        user {
          id
        }
        totalAmount
      }
    }
  `;

  try {
    const response = await subgraphQuery(
      query,
      config().DISTRIBUTOR_SUBGRAPH_URL
    );

    console.log(response.tokenClaims);

    return new Map(
      response.tokenClaims.map((claim: any) => [
        claim.user.id.toLowerCase(),
        claim.totalAmount
      ])
    );
  } catch (error) {
    console.error(`Error fetching claimed amounts for token ${token}:`, error);
    return new Map();
  }
}

async function updateMerkleRoots(merkleTries: { [token: string]: any }) {
  const cfg = config();

  // Setup provider and signer
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

  // Prepare arrays for updateMerkleRoots
  const tokenAddresses = [];
  const roots = [];

  // Map token names to addresses
  const tokenAddressMap = {
    KITE: cfg.KITE_ADDRESS,
    OP: cfg.OP_ADDRESS,
    DINERO: cfg.DINERO_ADDRESS,
    HAI: cfg.HAI_ADDRESS
  };

  // Build arrays for the contract call
  for (const [token, tree] of Object.entries(merkleTries)) {
    const tokenAddress = tokenAddressMap[token as keyof typeof tokenAddressMap];
    if (!tokenAddress) {
      console.warn(`No address found for token: ${token}`);
      continue;
    }

    tokenAddresses.push(tokenAddress);
    roots.push(tree.root);
    console.log(`Merkle root for ${token} (${tokenAddress}):`, tree.root);
  }

  try {
    console.log('Updating merkle roots...');

    // Notify transaction initiation
    await notifyTransaction({
      type: 'initiate',
      operation: 'Update Merkle Roots',
      details: {
        tokens: Object.keys(merkleTries),
        tokenAddresses,
        tokenCount: tokenAddresses.length
      }
    });

    const tx = await rewardDistributor.updateMerkleRoots(tokenAddresses, roots);
    console.log('Transaction hash:', tx.hash);

    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt?.blockNumber);

    // Notify transaction success
    await notifyTransaction({
      type: 'success',
      operation: 'Update Merkle Roots',
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      details: {
        tokens: Object.keys(merkleTries),
        gasUsed: receipt?.gasUsed?.toString()
      }
    });
    //
    // Send merkle update notification
    await notifyMerkleUpdate(Object.keys(merkleTries), roots);
  } catch (error) {
    console.error('Error updating merkle roots:', error);

    // Notify transaction failure
    await notifyTransaction({
      type: 'failure',
      operation: 'Update Merkle Roots',
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        tokens: Object.keys(merkleTries),
        tokenAddresses
      }
    });

    throw error;
  }
}

async function saveMerkleTreesAsFiles(
  merkleTries: { [token: string]: any },
  entryCounter: number
) {
  const currentDate = new Date();
  const dateString = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
  const timestamp = currentDate.toISOString().replace(/[:.]/g, '-'); // Full timestamp for uniqueness

  // Create backup directory if it doesn't exist
  const backupDir = path.join(process.cwd(), 'merkle-backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log(
    `Saving merkle trees as backup files for entry ${entryCounter}...`
  );

  for (const [token, tree] of Object.entries(merkleTries)) {
    try {
      const filename = `merkle-tree-${token}-entry${entryCounter}-${dateString}-${timestamp}.json`;
      const filepath = path.join(backupDir, filename);

      const treeData = {
        token,
        entryCounter,
        date: currentDate.toISOString(),
        root: tree.root,
        tree: tree.dump()
      };

      fs.writeFileSync(filepath, JSON.stringify(treeData, null, 2));
      console.log(`Merkle tree for ${token} saved to: ${filename}`);
    } catch (error) {
      console.error(`Error saving merkle tree for ${token}:`, error);
    }
  }
}

export const main = async (entryCounter: number = 0) => {
  console.log('executing main');

  const results = await combineResults();

  // Convert earned values to BigNumber with 18 decimals
  const adjustedResults = Object.entries(results)
    .map(([token, userRewards]) => {
      return {
        [token]: userRewards.map(reward => {
          console.log(reward.earned);

          return {
            address: reward.address,
            earned: ethers.utils
              .parseEther(reward.earned.toFixed(18))
              .toString()
          };
        })
      };
    })
    .reduce((acc, curr) => ({ ...acc, ...curr }), {});

  // Subtract claimed amounts
  const finalResults: typeof adjustedResults = {};

  for (const [token, rewards] of Object.entries(adjustedResults)) {
    console.log(`Processing claims for token: ${token}`);

    // Get all claimed amounts for this token

    const tokenAddressMap = {
      KITE: config().KITE_ADDRESS,
      OP: config().OP_ADDRESS,
      DINERO: config().DINERO_ADDRESS,
      HAI: config().HAI_ADDRESS
    };

    const claimedAmounts = await getClaimedAmounts(
      tokenAddressMap[token.toUpperCase() as keyof typeof tokenAddressMap],
      rewards.map(r => r.address)
    );

    // Subtract claimed amounts from earned amounts
    finalResults[token] = rewards
      .map(reward => {
        const claimed = claimedAmounts.get(reward.address.toLowerCase()) || '0';
        const remaining = ethers.BigNumber.from(reward.earned).sub(
          ethers.BigNumber.from(claimed)
        );
        const isDusty = remaining.lte(
          ethers.BigNumber.from(ethers.BigNumber.from(10).pow(16))
        );
        return {
          address: reward.address,
          earned: isDusty ? '0' : remaining.toString()
        };
      })
      .filter(reward => reward.earned !== '0');

    console.log(`Found ${claimedAmounts.size} previous claims for ${token}`);
  }

  console.log('doing merkle tries!!!', finalResults);

  // Generating merkle tree
  const merkleTries = Object.entries(finalResults)
    .map(([token, rewards]) => {
      const tree = StandardMerkleTree.of(
        rewards.map(({ address, earned }) => [address, earned]),
        ['address', 'uint256']
      );
      return { [token]: tree };
    })
    .reduce((pV, cV) => ({ ...pV, ...cV }), {});

  // Generate merkle trees and update them on-chain
  await updateMerkleRoots(merkleTries);

  // Save merkle trees as backup files
  await saveMerkleTreesAsFiles(merkleTries, entryCounter);

  // Upload Merkle tree to CloudFlare

  Object.entries(merkleTries).forEach(async ([token, tree]) => {
    try {
      await uploadMerkleTree({
        config: {
          accountId: config().CLOUDFLARE_ACCOUNT_ID,
          namespaceId: config().CLOUDFLARE_NAMESPACE_ID,
          apiToken: config().CLOUDFLARE_API_TOKEN
        },
        treeId: token,
        merkleTree: JSON.stringify(tree.dump())
      });
      console.log(`Merkle tree for ${token} uploaded successfully`);
    } catch (err) {
      console.error(err);
    }
  });
};

// main().catch(console.error);
