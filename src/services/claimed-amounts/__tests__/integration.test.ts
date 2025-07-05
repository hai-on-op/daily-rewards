/**
 * Integration tests for claimed amounts functionality
 */

import { createClaimedAmountsUseCases } from '../factory';
import { SubgraphClaimedAmountsRepository } from '../../subgraph/claimed-amounts-repository';
import { ClaimedAmountsService } from '../claimed-amounts-service';
import { ClaimedAmountsUseCases } from '../use-cases';

// Mock the subgraph repository
jest.mock('../../subgraph/claimed-amounts-repository', () => ({
  SubgraphClaimedAmountsRepository: jest.fn()
}));
jest.mock('../../../config', () => ({
  config: jest.fn()
}));

const MockedSubgraphRepository = SubgraphClaimedAmountsRepository as jest.MockedClass<typeof SubgraphClaimedAmountsRepository>;

describe('Claimed Amounts Integration Tests', () => {
  let useCases: ClaimedAmountsUseCases;
  let mockRepository: jest.Mocked<SubgraphClaimedAmountsRepository>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create a mock repository instance
    mockRepository = {
      getClaimedAmounts: jest.fn()
    } as any;

    // Mock the constructor to return our mock instance
    MockedSubgraphRepository.mockImplementation(() => mockRepository);

    // Create the use cases with the mocked repository
    useCases = createClaimedAmountsUseCases();
  });

  describe('Full Flow Integration', () => {
    it('should process rewards with claimed amounts through the entire stack', async () => {
      // Mock subgraph response
      mockRepository.getClaimedAmounts.mockResolvedValue([
        { userAddress: '0x123', claimedAmount: '500000000000000000' }, // 0.5 tokens
        { userAddress: '0x456', claimedAmount: '0' } // No claims
      ]);

      const rewards = [
        { address: '0x123', earned: '1000000000000000000' }, // 1 token
        { address: '0x456', earned: '2000000000000000000' }  // 2 tokens
      ];

      const result = await useCases.processRewardsWithClaimedAmounts('0xTOKEN', rewards);

      // Verify repository was called correctly
      expect(mockRepository.getClaimedAmounts).toHaveBeenCalledWith({
        token: '0xTOKEN',
        users: ['0x123', '0x456']
      });

      // Verify the result
      expect(result).toEqual([
        { address: '0x123', earned: '500000000000000000' }, // 1 - 0.5 = 0.5 tokens
        { address: '0x456', earned: '2000000000000000000' }  // 2 - 0 = 2 tokens
      ]);
    });

    it('should handle empty results from subgraph', async () => {
      mockRepository.getClaimedAmounts.mockResolvedValue([]);

      const rewards = [
        { address: '0x123', earned: '1000000000000000000' }
      ];

      const result = await useCases.processRewardsWithClaimedAmounts('0xTOKEN', rewards);

      expect(result).toEqual([
        { address: '0x123', earned: '1000000000000000000' } // No claims to subtract
      ]);
    });

    it('should filter out dust amounts correctly', async () => {
      mockRepository.getClaimedAmounts.mockResolvedValue([
        { userAddress: '0x123', claimedAmount: '990000000000000000' }, // 0.99 tokens claimed
        { userAddress: '0x456', claimedAmount: '0' }
      ]);

      const rewards = [
        { address: '0x123', earned: '1000000000000000000' }, // 1 token
        { address: '0x456', earned: '5000000000000000' }     // 0.005 tokens (dust)
      ];

      const result = await useCases.processRewardsWithClaimedAmounts('0xTOKEN', rewards);

      // 0x123: 1 - 0.99 = 0.01 tokens (exactly dust threshold, should be filtered out)
      // 0x456: 0.005 tokens (dust, should be filtered out)
      expect(result).toEqual([]);
    });

    it('should calculate total claimed amounts correctly', async () => {
      mockRepository.getClaimedAmounts.mockResolvedValue([
        { userAddress: '0x123', claimedAmount: '1000000000000000000' }, // 1 token
        { userAddress: '0x456', claimedAmount: '2000000000000000000' }  // 2 tokens
      ]);

      const result = await useCases.getTotalClaimedAmount('0xTOKEN', ['0x123', '0x456']);

      expect(result).toBe('3000000000000000000'); // 3 tokens total
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle repository errors gracefully', async () => {
      mockRepository.getClaimedAmounts.mockResolvedValue([]); // Repository returns empty array on error

      const rewards = [
        { address: '0x123', earned: '1000000000000000000' }
      ];

      const result = await useCases.processRewardsWithClaimedAmounts('0xTOKEN', rewards);

      // When repository returns empty array, no claims are subtracted
      // Original rewards should be returned (minus dust filtering)
      expect(result).toEqual([
        { address: '0x123', earned: '1000000000000000000' } // Original amount (not dust)
      ]);
    });

    it('should handle empty input gracefully', async () => {
      const result = await useCases.processRewardsWithClaimedAmounts('0xTOKEN', []);

      expect(result).toEqual([]);
      expect(mockRepository.getClaimedAmounts).not.toHaveBeenCalled();
    });
  });
}); 