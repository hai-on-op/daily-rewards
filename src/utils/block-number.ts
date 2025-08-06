/**
 * Utility functions for block number operations
 */

import { haiveloProvider, lpProvider, minterProvider } from './chain';

export interface BlockNumberConfig {
  lpEndBlock: string;
  minterEndBlock: string;
  haiveloEndBlock: string;
}

/**
 * Sets environment variables for end blocks with a delay for subgraph indexing
 * @param blockNumberDelay - The number of blocks to delay (default: 30)
 * @returns Promise that resolves to the block number configuration
 */
export async function setEndBlocksWithDelay(blockNumberDelay: number = 30): Promise<BlockNumberConfig> {
  // We consider this blocknumber index delay for the subgraph
  const lpEndBlock = String((await lpProvider.getBlockNumber()) - blockNumberDelay);
  const minterEndBlock = String((await minterProvider.getBlockNumber()) - blockNumberDelay);
  const haiveloEndBlock = String((await haiveloProvider.getBlockNumber()) - blockNumberDelay);

  // Set environment variables
  process.env.LP_END_BLOCK = lpEndBlock;
  process.env.MINTER_END_BLOCK = minterEndBlock;
  process.env.HAIVELO_END_BLOCK = haiveloEndBlock;

  return {
    lpEndBlock,
    minterEndBlock,
    haiveloEndBlock
  };
} 