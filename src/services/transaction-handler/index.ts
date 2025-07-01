/**
 * Service for handling blockchain transactions with automatic notifications
 */

import { ethers } from 'ethers';
import { notifyTransaction } from '../../modules/telegram-bot';

export interface TransactionOptions {
  operation: string;
  details?: any;
  successDetails?: any;
  failureDetails?: any;
}

export interface TransactionResult {
  txHash: string;
  blockNumber?: number;
  receipt: ethers.ContractReceipt;
}

export interface RewardProcessingOptions {
  entryCounter: number;
  effectiveEntryCounter: number;
  lpEndBlock: string;
  minterEndBlock: string;
  haiveloEndBlock: string;
}

/**
 * Executes a transaction with automatic notification handling
 * @param transactionFunction - The function that returns the transaction promise
 * @param options - Configuration options for the transaction
 * @returns Promise that resolves to the transaction result
 */
export async function executeTransactionWithNotifications(
  transactionFunction: () => Promise<ethers.ContractTransaction>,
  options: TransactionOptions
): Promise<TransactionResult> {
  const { operation, details, successDetails, failureDetails } = options;

  try {
    // Notify transaction initiation
    await notifyTransaction({
      type: 'initiate',
      operation,
      details
    });

    // Execute the transaction
    const tx = await transactionFunction();
    console.log(`${operation} transaction sent: ${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();

    // Notify success
    await notifyTransaction({
      type: 'success',
      operation,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      details: successDetails
    });

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      receipt
    };
  } catch (error) {
    // Notify failure
    await notifyTransaction({
      type: 'failure',
      operation,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: failureDetails
    });

    throw error;
  }
}

/**
 * Executes a contract method with automatic notification handling
 * @param contract - The contract instance
 * @param methodName - The method name to call
 * @param args - Arguments to pass to the method
 * @param options - Configuration options for the transaction
 * @returns Promise that resolves to the transaction result
 */
export async function executeContractMethodWithNotifications(
  contract: ethers.Contract,
  methodName: string,
  args: any[] = [],
  options: TransactionOptions
): Promise<TransactionResult> {
  return executeTransactionWithNotifications(
    () => contract[methodName](...args),
    options
  );
}

/**
 * Executes reward processing with automatic notification handling
 * @param processingFunction - The function that performs the reward processing
 * @param options - Configuration options for reward processing
 * @returns Promise that resolves when processing is complete
 */
export async function executeRewardProcessingWithNotifications(
  processingFunction: () => Promise<void>,
  options: RewardProcessingOptions
): Promise<void> {
  const { entryCounter, effectiveEntryCounter, lpEndBlock, minterEndBlock, haiveloEndBlock } = options;

  try {
    // Notify start of reward processing
    await notifyTransaction({
      type: 'initiate',
      operation: 'Process Daily Rewards',
      details: {
        entryCounter,
        effectiveEntryCounter,
        lpEndBlock,
        minterEndBlock,
        haiveloEndBlock
      }
    });

    // Execute the processing function
    await processingFunction();

    // Notify successful completion
    await notifyTransaction({
      type: 'success',
      operation: 'Process Daily Rewards',
      details: {
        completedEntryCounter: entryCounter,
        nextEntryCounter: entryCounter + 1
      }
    });
  } catch (error) {
    // Notify failure
    await notifyTransaction({
      type: 'failure',
      operation: 'Process Daily Rewards',
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        failedAtEntryCounter: entryCounter,
        effectiveEntryCounter
      }
    });

    throw error;
  }
} 