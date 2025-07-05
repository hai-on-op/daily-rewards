/**
 * Unit tests for ClaimedAmountsService
 */

import { ClaimedAmountsService } from '../claimed-amounts-service';
import { ClaimedAmountsRepository, ClaimedAmountsQuery, ClaimedAmountsResult } from '../../../domain/claimed-amounts';

// Mock repository
const mockRepository: jest.Mocked<ClaimedAmountsRepository> = {
  getClaimedAmounts: jest.fn()
};

describe('ClaimedAmountsService', () => {
  let service: ClaimedAmountsService;

  beforeEach(() => {
    service = new ClaimedAmountsService(mockRepository);
    jest.clearAllMocks();
  });

  describe('getClaimedAmountsMap', () => {
    it('should return empty map when token is empty', async () => {
      const result = await service.getClaimedAmountsMap('', ['0x123', '0x456']);

      expect(result).toEqual({});
      expect(mockRepository.getClaimedAmounts).not.toHaveBeenCalled();
    });

    it('should return empty map when users array is empty', async () => {
      const result = await service.getClaimedAmountsMap('0xTOKEN', []);

      expect(result).toEqual({});
      expect(mockRepository.getClaimedAmounts).not.toHaveBeenCalled();
    });

    it('should return map of claimed amounts for valid input', async () => {
      const mockClaims: ClaimedAmountsResult[] = [
        { userAddress: '0x123', claimedAmount: '100' },
        { userAddress: '0x456', claimedAmount: '200' }
      ];

      mockRepository.getClaimedAmounts.mockResolvedValue(mockClaims);

      const result = await service.getClaimedAmountsMap('0xTOKEN', ['0x123', '0x456']);

      expect(mockRepository.getClaimedAmounts).toHaveBeenCalledWith({
        token: '0xTOKEN',
        users: ['0x123', '0x456']
      });

      expect(result).toEqual({
        '0x123': '100',
        '0x456': '200'
      });
    });

    it('should handle repository errors gracefully', async () => {
      mockRepository.getClaimedAmounts.mockRejectedValue(new Error('Network error'));

      const result = await service.getClaimedAmountsMap('0xTOKEN', ['0x123']);

      expect(result).toEqual({});
      expect(mockRepository.getClaimedAmounts).toHaveBeenCalledWith({
        token: '0xTOKEN',
        users: ['0x123']
      });
    });
  });

  describe('getClaimedAmountForUser', () => {
    it('should return claimed amount for specific user', async () => {
      const mockClaims: ClaimedAmountsResult[] = [
        { userAddress: '0x123', claimedAmount: '100' }
      ];

      mockRepository.getClaimedAmounts.mockResolvedValue(mockClaims);

      const result = await service.getClaimedAmountForUser('0xTOKEN', '0x123');

      expect(result).toBe('100');
    });

    it('should return "0" when user has no claims', async () => {
      mockRepository.getClaimedAmounts.mockResolvedValue([]);

      const result = await service.getClaimedAmountForUser('0xTOKEN', '0x123');

      expect(result).toBe('0');
    });
  });
});