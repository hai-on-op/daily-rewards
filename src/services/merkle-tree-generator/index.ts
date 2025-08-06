/**
 * Service for generating merkle trees from processed rewards
 */

import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { ProcessedRewardResults } from '../reward-processor';

export interface MerkleTree {
  root: string;
  dump: () => any;
}

export interface MerkleTreesData {
  [token: string]: MerkleTree;
}

/**
 * Generates merkle trees from processed rewards
 * @param finalResults - Final processed rewards after claimed amounts filtering
 * @returns Object containing merkle trees for each token
 */
export function generateMerkleTrees(finalResults: ProcessedRewardResults): MerkleTreesData {
  console.log('Generating merkle trees...');

  const merkleTries = Object.entries(finalResults)
    .map(([token, rewards]) => {
      const tree = StandardMerkleTree.of(
        rewards.map(({ address, earned }) => [address, earned]),
        ['address', 'uint256']
      );
      return { [token]: tree };
    })
    .reduce((pV, cV) => ({ ...pV, ...cV }), {});

  console.log(`Generated merkle trees for ${Object.keys(merkleTries).length} tokens`);
  return merkleTries;
} 