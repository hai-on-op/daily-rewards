/**
 * Unit tests for SubgraphClaimedAmountsRepository
 */

import { SubgraphClaimedAmountsRepository } from '../claimed-amounts-repository';
import { subgraphQuery } from '../utils';
import { config } from '../../../config';

// Mock dependencies
jest.mock('../utils', () => ({
  subgraphQuery: jest.fn()
}));
jest.mock('../../../config', () => ({
  config: jest.fn()
}));

const mockSubgraphQuery = subgraphQuery as jest.MockedFunction<typeof subgraphQuery>;
const mockConfig = config as jest.MockedFunction<typeof config>;

describe('SubgraphClaimedAmountsRepository', () => {
  let repository: SubgraphClaimedAmountsRepository;

  beforeEach(() => {
    mockConfig.mockReturnValue({
      DISTRIBUTOR_SUBGRAPH_URL: 'https://test-subgraph.com'
    } as any);

    repository = new SubgraphClaimedAmountsRepository();
    jest.clearAllMocks();
  });

  describe('getClaimedAmounts', () => {
    it('should return empty array when users array is empty', async () => {
      const result = await repository.getClaimedAmounts({
        token: '0xTOKEN',
        users: []
      });

      expect(result).toEqual([]);
      expect(mockSubgraphQuery).not.toHaveBeenCalled();
    });

    it('should return empty array when all users are invalid', async () => {
      const result = await repository.getClaimedAmounts({
        token: '0xTOKEN',
        users: ['', null as any, undefined as any]
      });

      expect(result).toEqual([]);
      expect(mockSubgraphQuery).not.toHaveBeenCalled();
    });

    it('should fetch and return claimed amounts for valid users', async () => {
      const mockResponse = {
        tokenClaims: [
          { user: { id: '0x123' }, totalAmount: '100' },
          { user: { id: '0x456' }, totalAmount: '200' }
        ]
      };

      mockSubgraphQuery.mockResolvedValue(mockResponse);

      const result = await repository.getClaimedAmounts({
        token: '0xTOKEN',
        users: ['0x123', '0x456']
      });

      expect(mockSubgraphQuery).toHaveBeenCalledWith(
        expect.stringContaining('0xtoken'),
        'https://test-subgraph.com'
      );

      expect(result).toEqual([
        { userAddress: '0x123', claimedAmount: '100' },
        { userAddress: '0x456', claimedAmount: '200' }
      ]);
    });

    it('should normalize addresses to lowercase', async () => {
      const mockResponse = {
        tokenClaims: [
          { user: { id: '0xABC' }, totalAmount: '100' }
        ]
      };

      mockSubgraphQuery.mockResolvedValue(mockResponse);

      const result = await repository.getClaimedAmounts({
        token: '0xTOKEN',
        users: ['0xABC', '0xDEF']
      });

      expect(result).toEqual([
        { userAddress: '0xabc', claimedAmount: '100' }
      ]);
    });

    it('should handle missing tokenClaims in response', async () => {
      const mockResponse = {};

      mockSubgraphQuery.mockResolvedValue(mockResponse);

      const result = await repository.getClaimedAmounts({
        token: '0xTOKEN',
        users: ['0x123']
      });

      expect(result).toEqual([]);
    });

    it('should handle subgraph query errors gracefully', async () => {
      mockSubgraphQuery.mockRejectedValue(new Error('Network error'));

      const result = await repository.getClaimedAmounts({
        token: '0xTOKEN',
        users: ['0x123']
      });

      expect(result).toEqual([]);
    });
  });
});