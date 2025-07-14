/**
 * Transfer processor service implementation
 */

import { config } from '../../../config';
import { TransferProcessorService } from '../domain/services';
import { ProcessedTransfer, TransferRewardPeriod } from '../domain/types';

export class TransferProcessorServiceImpl implements TransferProcessorService {
  processTransfers(transfers: ProcessedTransfer[]): TransferRewardPeriod[] {
    if (transfers.length === 0) return [];

    const REWARD_DEPOSIT_EPOCH_BLOCK = (7 * 24 * 60 * 60) / 2; // 2 seconds block time
    const periods: TransferRewardPeriod[] = [];

    for (let i = 0; i < transfers.length; i++) {
      const currentTransfer = transfers[i];
      const rewardsAmount = currentTransfer.value;

      if (transfers.length === 1) {
        // Single transfer: calculate full period from epoch before transfer to end block
        const calculationBlock = config().HAIVELO_END_BLOCK;
        periods.push({
          startBlock: currentTransfer.blockNumber - REWARD_DEPOSIT_EPOCH_BLOCK,
          endBlock: calculationBlock - REWARD_DEPOSIT_EPOCH_BLOCK,
          rewardAmount: (rewardsAmount * (calculationBlock - currentTransfer.blockNumber)) / REWARD_DEPOSIT_EPOCH_BLOCK,
          tokenSymbol: currentTransfer.tokenSymbol
        });
      } else if (i === 0) {
        // First transfer: calculate from epoch before first transfer to first transfer
        periods.push({
          startBlock: currentTransfer.blockNumber - REWARD_DEPOSIT_EPOCH_BLOCK,
          endBlock: currentTransfer.blockNumber,
          rewardAmount: rewardsAmount,
          tokenSymbol: currentTransfer.tokenSymbol
        });
      } else if (i === transfers.length - 1) {
        // Last transfer: calculate partial epoch to end block
        const calculationBlock = config().HAIVELO_END_BLOCK;
        const previousTransfer = transfers[i - 1];

        const rewardAmountForLastIncompleteEpoch =
          ((calculationBlock - currentTransfer.blockNumber) / REWARD_DEPOSIT_EPOCH_BLOCK) * rewardsAmount;

        periods.push({
          startBlock: previousTransfer.blockNumber,
          endBlock: calculationBlock - REWARD_DEPOSIT_EPOCH_BLOCK,
          rewardAmount: rewardAmountForLastIncompleteEpoch,
          tokenSymbol: currentTransfer.tokenSymbol
        });
      } else {
        // Middle transfers: calculate from previous transfer to current transfer
        const previousTransfer = transfers[i - 1];

        periods.push({
          startBlock: previousTransfer.blockNumber,
          endBlock: currentTransfer.blockNumber,
          rewardAmount: rewardsAmount,
          tokenSymbol: currentTransfer.tokenSymbol
        });
      }
    }

    return periods;
  }
} 