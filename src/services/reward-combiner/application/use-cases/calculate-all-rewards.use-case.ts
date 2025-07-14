/**
 * Use case for calculating all rewards
 */

import { config } from '../../../../config';
import { RewardCalculationService } from '../../domain/services';
import { RewardsMap, TransferRewardPeriod } from '../../domain/types';
import { TransferRepository, RewardCalculationRepository } from '../../domain/repositories';
import { RewardCombinerService } from '../../domain/services';
import { TransferProcessorService } from '../../domain/services';

export class CalculateAllRewardsUseCase implements RewardCalculationService {
  constructor(
    private transferRepository: TransferRepository,
    private rewardCalculationRepository: RewardCalculationRepository,
    private rewardCombinerService: RewardCombinerService,
    private transferProcessorService: TransferProcessorService
  ) {}

  async calculateAllRewards(): Promise<RewardsMap> {
    console.log('Starting reward calculation...');

    // Step 1: Fetch and process transfers
    const processedTransfers = await this.transferRepository.getProcessedTransfers();
    console.log(`Processed ${processedTransfers.length} transfers:`, processedTransfers);

    // Step 2: Find earliest transfer block for historical calculations
    const earliestTransferBlock = processedTransfers.length > 0
      ? Math.min(...processedTransfers.map(t => t.blockNumber))
      : 0;

    // Step 3: Calculate all reward types in parallel
    const [
      haiVeloHistoricalRewards,
      haiVeloDailyRewards,
      lpHistoricalRewards,
      minterRewards
    ] = await Promise.all([
      this.calculateHaiVeloHistoricalRewards(earliestTransferBlock),
      this.calculateHaiVeloDailyRewards(processedTransfers),
      this.calculateLpHistoricalRewards(),
      this.calculateMinterRewards()
    ]);

    // Step 4: Combine all rewards
    const allRewardMaps = [
      lpHistoricalRewards,
      haiVeloHistoricalRewards,
      ...haiVeloDailyRewards,
      minterRewards
    ];

    const combinedRewards = this.rewardCombinerService.combineRewards(allRewardMaps);

    console.log('Reward calculation completed');
    return combinedRewards;
  }

  private async calculateHaiVeloHistoricalRewards(earliestTransferBlock: number): Promise<RewardsMap> {
    if (earliestTransferBlock === 0) return {};

    const REWARD_DEPOSIT_EPOCH_BLOCK = (7 * 24 * 60 * 60) / 2;
    const haiVeloHistoricalRewards: RewardsMap = {};

    for (const [rewardToken, amount] of Object.entries(config().rewards.haiVelo.historicConfig)) {
      const rewards = await this.rewardCalculationRepository.calculateHaiveloRewards(amount, {
        startBlock: config().HAIVELO_HISTORIC_START_BLOCK,
        endBlock: earliestTransferBlock - REWARD_DEPOSIT_EPOCH_BLOCK
      });

      haiVeloHistoricalRewards[rewardToken] = Object.entries(rewards)
        .map(([address, value]) => ({
          address,
          earned: value.earned
        }))
        .filter(({ earned }) => earned > 0)
        .sort((a, b) => b.earned - a.earned);
    }

    return haiVeloHistoricalRewards;
  }

  private async calculateHaiVeloDailyRewards(transfers: any[]): Promise<RewardsMap[]> {
    const periods = this.transferProcessorService.processTransfers(transfers);
    const haiVeloDailyRewards: RewardsMap[] = [];

    for (const period of periods) {
      const rewards = await this.rewardCalculationRepository.calculateHaiveloRewards(
        period.rewardAmount,
        { startBlock: period.startBlock, endBlock: period.endBlock }
      );

      const periodRewards: RewardsMap = {
        [period.tokenSymbol]: Object.entries(rewards)
          .map(([address, value]) => ({
            address,
            earned: value.earned
          }))
          .filter(({ earned }) => earned > 0)
          .sort((a, b) => b.earned - a.earned)
      };

      console.log(`${period.tokenSymbol} rewards:`, periodRewards);
      haiVeloDailyRewards.push(periodRewards);
    }

    return haiVeloDailyRewards;
  }

  private async calculateLpHistoricalRewards(): Promise<RewardsMap> {
    const lpHistoricalRewards: RewardsMap = {};

    for (const [rewardToken, amount] of Object.entries(config().rewards.lp.historicConfig)) {
      const rewards = await this.rewardCalculationRepository.calculateLpRewards(amount, {
        startBlock: config().LP_HISTORIC_START_BLOCK,
        endBlock: config().LP_START_BLOCK
      });

      lpHistoricalRewards[rewardToken] = Object.entries(rewards)
        .map(([address, value]) => ({
          address,
          earned: value.earned
        }))
        .filter(({ earned }) => earned > 0)
        .sort((a, b) => b.earned - a.earned);
    }

    return lpHistoricalRewards;
  }

  private async calculateMinterRewards(): Promise<RewardsMap> {
    const minterRewards: RewardsMap = {};

    const rewards = await this.rewardCalculationRepository.calculateMinterRewards(
      config().MINTER_START_BLOCK,
      config().MINTER_END_BLOCK
    );

    const output: Record<string, number> = {};

    for (const [rewardToken, amount] of Object.entries(config().rewards.minter.config)) {
      const entries = Object.entries(rewards[rewardToken]);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const [token, userData] = entry;
        const userDataEntries = Object.entries(userData);
        for (let j = 0; j < userDataEntries.length; j++) {
          const userDataEntry = userDataEntries[j];
          const [address, value] = userDataEntry;
          const earned = value.earned;
          if (output[address]) {
            output[address] += earned;
          } else {
            output[address] = earned;
          }
        }
      }
    }

    minterRewards['KITE'] = Object.entries(output)
      .map(([address, earned]) => ({
        address,
        earned
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);

    return minterRewards;
  }
}