/**
 * Unit tests for ClaimedAmountsUseCases
 */

import { ClaimedAmountsUseCases, UserReward, ProcessedReward } from '../use-cases';
import { ClaimedAmountsService } from '../claimed-amounts-service';

// Mock service
const mockService = {
  getClaimedAmountsMap: jest.fn(),
  getClaimedAmountForUser: jest.fn()
} as any;

describe('ClaimedAmountsUseCases', () => {
  let useCases: ClaimedAmountsUseCases;

  beforeEach(() => {
    useCases = new ClaimedAmountsUseCases(mockService);
    jest.clearAllMocks();
  });

  describe('processRewardsWithClaimedAmounts', () => {
    it('should return empty array when rewards array is empty', async () => {
      const result = await useCases.processRewardsWithClaimedAmounts('0xTOKEN', []);
      
      expect(result).toEqual([]);
      expect(mockService.getClaimedAmountsMap).not.toHaveBeenCalled();
    });

    it('should process rewards and subtract claimed amounts', async () => {
      const rewards: UserReward[] = [
        { address: '0x123', earned: '1000000000000000000' }, // 1 token
        { address: '0x456', earned: '2000000000000000000' }  // 2 tokens
      ];

      mockService.getClaimedAmountsMap.mockResolvedValue({
        '0x123': '500000000000000000', // 0.5 tokens claimed
        '0x456': '0' // No claims
      });

      const result = await useCases.processRewardsWithClaimedAmounts('0xTOKEN', rewards);

      expect(mockService.getClaimedAmountsMap).toHaveBeenCalledWith('0xTOKEN', ['0x123', '0x456']);
      
      expect(result).toEqual([
        { address: '0x123', earned: '500000000000000000' }, // 1 - 0.5 = 0.5 tokens
        { address: '0x456', earned: '2000000000000000000' }  // 2 - 0 = 2 tokens
      ]);
    });

    it('should filter out dust amounts (less than 0.01 tokens)', async () => {
      const rewards: UserReward[] = [
        { address: '0x123', earned: '1000000000000000000' }, // 1 token
        { address: '0x456', earned: '5000000000000000' }     // 0.005 tokens (dust)
      ];

      mockService.getClaimedAmountsMap.mockResolvedValue({
        '0x123': '990000000000000000', // 0.99 tokens claimed
        '0x456': '0' // No claims
      });

      const result = await useCases.processRewardsWithClaimedAmounts('0xTOKEN', rewards);

      // 0x123: 1 - 0.99 = 0.01 tokens (exactly dust threshold, should be filtered out)
      // 0x456: 0.005 tokens (dust, should be filtered out)
      expect(result).toEqual([]);
    });

    it('should filter out rewards with zero remaining amount', async () => {
      const rewards: UserReward[] = [
        { address: '0x123', earned: '1000000000000000000' }, // 1 token
        { address: '0x456', earned: '2000000000000000000' }  // 2 tokens
      ];

      mockService.getClaimedAmountsMap.mockResolvedValue({
        '0x123': '1000000000000000000', // All claimed
        '0x456': '0' // No claims
      });

      const result = await useCases.processRewardsWithClaimedAmounts('0xTOKEN', rewards);

      expect(result).toEqual([
        { address: '0x456', earned: '2000000000000000000' } // Only this one remains
      ]);
    });
  });

  describe('getTotalClaimedAmount', () => {
    it('should return total claimed amount for all users', async () => {
      mockService.getClaimedAmountsMap.mockResolvedValue({
        '0x123': '1000000000000000000', // 1 token
        '0x456': '2000000000000000000'  // 2 tokens
      });

      const result = await useCases.getTotalClaimedAmount('0xTOKEN', ['0x123', '0x456']);

      expect(result).toBe('3000000000000000000'); // 3 tokens total
    });

    it('should return "0" when no claims exist', async () => {
      mockService.getClaimedAmountsMap.mockResolvedValue({});

      const result = await useCases.getTotalClaimedAmount('0xTOKEN', ['0x123', '0x456']);

      expect(result).toBe('0');
    });

    it('should handle service errors gracefully', async () => {
      mockService.getClaimedAmountsMap.mockResolvedValue({}); // Service returns empty map on error

      const rewards = [
        { address: '0x123', earned: '1000000000000000000' }
      ];

      const result = await useCases.processRewardsWithClaimedAmounts('0xTOKEN', rewards);

      // When service returns empty map, no claims are subtracted
      // Original rewards should be returned (minus dust filtering)
      expect(result).toEqual([
        { address: '0x123', earned: '1000000000000000000' } // Original amount (not dust)
      ]);
    });
  });
}); 