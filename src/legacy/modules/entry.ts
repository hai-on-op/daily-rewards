/**
 * @deprecated This module has been replaced by the new orchestrator.
 * Use `src/modules/orchestrator/cli.ts` instead.
 * 
 * This file is kept for reference only.
 * 
 * New usage:
 *   yarn entry           # Production mode (all features)
 *   yarn entry:dev       # Development mode (minimal operations)
 *   yarn entry:dry-run   # Dry-run mode (calculate but don't persist)
 * 
 * Or with environment variables:
 *   FEATURE_MODE=production yarn entry
 *   FEATURE_MODE=development yarn entry
 *   FEATURE_MODE=dry-run yarn entry
 */

import { config } from '../config';
import { main } from './main';
import { notifyTransaction, getTelegramBot } from './telegram-bot';

import { multiplyConfigValues, setEndBlocksWithDelay } from '../utils';
import { initializeTelegramBot } from './telegram-bot';
import { initializeContracts } from '../services/contract-initialization';
import { executeContractMethodWithNotifications, executeRewardProcessingWithNotifications } from '../services/transaction-handler';

config();

const entry = async () => {
  const cfg = config();

  // Initialize Telegram bot
  await initializeTelegramBot();

  // Initialize contracts
  const { rewardDistributor } = await initializeContracts();

  const isRewardDistributorPaused = await rewardDistributor.paused();

  console.log('Reward Distributor Paused:', isRewardDistributorPaused);

  if (!isRewardDistributorPaused) {
    await executeContractMethodWithNotifications(
      rewardDistributor,
      'pause',
      [],
      {
        operation: 'Pause Reward Distributor',
        details: { currentStatus: 'unpaused' },
        successDetails: { newStatus: 'paused' }
      }
    );
    console.log('Reward Distributor Paused!');
  }

  // Read current counter value
  const entryCounter = Number(String(await rewardDistributor.epochCounter()));

  if (entryCounter === 0) {
    try {
      await executeContractMethodWithNotifications(
        rewardDistributor,
        'startInitialEpoch',
        [],
        {
          operation: 'Start Initial Epoch',
          details: { epochCounter: 0 },
          successDetails: { newEpochCounter: 1 }
        }
      );
      console.log('Reward Distributor Started Initial Epoch!');
    } catch (error) {
      // Error handling is already done in the transaction handler
    }
  } else {
    console.log('Current entry count:', entryCounter);

    // Set end blocks with delay for subgraph indexing
    const blockNumberConfig = await setEndBlocksWithDelay();

    const effectiveEntryCounter = entryCounter - 1;

    await executeRewardProcessingWithNotifications(
      async () => {
        // Parse and update REWARD_LP_CONFIG
        const currentLPConfig = JSON.parse(process.env.REWARD_LP_CONFIG || '{}');
        const multipliedLPConfig = multiplyConfigValues(
          currentLPConfig,
          effectiveEntryCounter
        );
        process.env.REWARD_LP_CONFIG = JSON.stringify(multipliedLPConfig);
        console.log('Updated REWARD_LP_CONFIG:', process.env.REWARD_LP_CONFIG);

        // Parse and update REWARD_HAIVELO_CONFIG
        const currentHaiveloConfig = JSON.parse(
          process.env.REWARD_HAIVELO_CONFIG || '{}'
        );
        const multipliedHaiveloConfig = multiplyConfigValues(
          currentHaiveloConfig,
          effectiveEntryCounter
        );
        process.env.REWARD_HAIVELO_CONFIG = JSON.stringify(
          multipliedHaiveloConfig
        );
        console.log(
          'Updated REWARD_HAIVELO_CONFIG:',
          process.env.REWARD_HAIVELO_CONFIG
        );

        await main(entryCounter);

        // Increment and save counter after successful execution
        console.log('Entry count updated to:', entryCounter + 1);
      },
      {
        entryCounter,
        effectiveEntryCounter,
        lpEndBlock: blockNumberConfig.lpEndBlock,
        minterEndBlock: blockNumberConfig.minterEndBlock,
        haiveloEndBlock: blockNumberConfig.haiveloEndBlock
      }
    );
  }
};

entry()
  .then(() => {})
  .catch(err => {
    console.error(err);
  });

// Legacy code for minter rewards

/*
  process.env.MINTER_END_BLOCK = String(await minterProvider.getBlockNumber());


    // Parse and update REWARD_MINTER_CONFIG
    const currentMinterConfig = JSON.parse(
      process.env.REWARD_MINTER_CONFIG || "{}"
    );
    const multipliedMinterConfig = multiplyConfigValues(
      currentMinterConfig,
      effectiveEntryCounter
    );
    process.env.REWARD_MINTER_CONFIG = JSON.stringify(multipliedMinterConfig);
    console.log(
      "Updated REWARD_MINTER_CONFIG:",
      process.env.REWARD_MINTER_CONFIG
    );
    

    function multiplyConfigValues(config: any, multiplier: number): any {
  const result: any = {};

  for (const [token, tokenConfig] of Object.entries(config)) {
    result[token] = {};
    for (const [collateral, amount] of Object.entries(tokenConfig as any)) {
      result[token][collateral] = (amount as number) * multiplier;
    }
  }

  return result;
}

  */
