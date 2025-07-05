import { combineResults } from './result-combiner';
import { ethers } from 'ethers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import * as fs from 'fs';
import * as path from 'path';

import { uploadMerkleTree } from './upload-merkle-tree';
import { config } from '../config';
import { createClaimedAmountsUseCases } from '../services/claimed-amounts/factory';
import { updateMerkleRootsWithNotifications } from '../services/merkle-root-updater';
import { initializeContracts } from '../services/contract-initialization';





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

  // Initialize claimed amounts use cases
  const claimedAmountsUseCases = createClaimedAmountsUseCases();

  // Subtract claimed amounts
  const finalResults: typeof adjustedResults = {};

  for (const [token, rewards] of Object.entries(adjustedResults)) {
    console.log(`Processing claims for token: ${token}`);

    const tokenAddressMap = {
      KITE: config().KITE_ADDRESS,
      OP: config().OP_ADDRESS,
      DINERO: config().DINERO_ADDRESS,
      HAI: config().HAI_ADDRESS
    };

    const tokenAddress = tokenAddressMap[token.toUpperCase() as keyof typeof tokenAddressMap];
    
    // Process rewards with claimed amounts using the new layered architecture
    finalResults[token] = await claimedAmountsUseCases.processRewardsWithClaimedAmounts(
      tokenAddress,
      rewards
    );

    console.log(`Processed ${rewards.length} rewards for ${token}, ${finalResults[token].length} remain after filtering`);
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

  // Initialize contracts for merkle root update
  const { rewardDistributor } = await initializeContracts();

  // Generate merkle trees and update them on-chain
  await updateMerkleRootsWithNotifications({
    merkleTries,
    rewardDistributor
  });

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
