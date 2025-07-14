/**
 * Factory for creating reward combiner service instances
 */

import { TransferRepositoryImpl } from './infrastructure/transfer-repository';
import { RewardCalculationRepositoryImpl } from './infrastructure/reward-calculation-repository';
import { RewardCombinerServiceImpl } from './application/reward-combiner.service';
import { TransferProcessorServiceImpl } from './application/transfer-processor.service';
import { CalculateAllRewardsUseCase } from './application/use-cases/calculate-all-rewards.use-case';
import { RewardCalculationService } from './domain/services';

/**
 * Creates a configured reward calculation service with all dependencies
 * @returns Configured reward calculation service
 */
export function createRewardCalculationService(): RewardCalculationService {
  // Create infrastructure layer
  const transferRepository = new TransferRepositoryImpl();
  const rewardCalculationRepository = new RewardCalculationRepositoryImpl();

  // Create application layer
  const rewardCombinerService = new RewardCombinerServiceImpl();
  const transferProcessorService = new TransferProcessorServiceImpl();

  // Create use case with all dependencies
  const calculateAllRewardsUseCase = new CalculateAllRewardsUseCase(
    transferRepository,
    rewardCalculationRepository,
    rewardCombinerService,
    transferProcessorService
  );

  return calculateAllRewardsUseCase;
} 