/**
 * Unit tests for reward combiner factory
 */

import { createRewardCalculationService } from '../factory';
import { RewardCalculationService } from '../domain/services';

describe('Reward Combiner Factory', () => {
  it('should create a reward calculation service', () => {
    const service = createRewardCalculationService();

    expect(service).toBeDefined();
    expect(typeof service.calculateAllRewards).toBe('function');
  });

  it('should return a service that implements RewardCalculationService', () => {
    const service = createRewardCalculationService();

    expect(service).toHaveProperty('calculateAllRewards');
    expect(typeof service.calculateAllRewards).toBe('function');
  });
});