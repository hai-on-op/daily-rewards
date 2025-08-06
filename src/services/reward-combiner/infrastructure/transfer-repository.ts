/**
 * Transfer repository implementation
 */

import { getTokenTransfersToContract, TokenTransfer } from '../../../services/reward-distributor-deposits';
import { TransferRepository } from '../domain/repositories';
import { ProcessedTransfer } from '../domain/types';

export class TransferRepositoryImpl implements TransferRepository {
  async getProcessedTransfers(): Promise<ProcessedTransfer[]> {
    const FILTER_CONSTANT = 10 ** 18;

    const transfers: TokenTransfer[] = await getTokenTransfersToContract();

    return transfers
      .filter(t => Number(t.value) >= FILTER_CONSTANT)
      .map(t => ({
        blockNumber: t.blockNumber,
        value: Number(t.value) / 10 ** 18,
        tokenSymbol: t.tokenSymbol
      }));
  }
} 