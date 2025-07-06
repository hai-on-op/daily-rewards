/**
 * Unit tests for reward processor service
 */

import { ethers } from 'ethers';
import {
  convertRewardsToBigNumber,
  getTokenAddressMap,
  processRewardsWithClaimedAmounts,
  processAllRewards
} from '../index';
import { createClaimedAmountsUseCases } from '../../claimed-amounts/factory';

// Mock dependencies
jest.mock('../../claimed-amounts/factory');
jest.mock('../../../config', () => ({
  config: () => ({
    KITE_ADDRESS: '0x1234567890123456789012345678901234567890',
    OP_ADDRESS: '0x2345678901234567890123456789012345678901',
    DINERO_ADDRESS: '0x3456789012345678901234567890123456789012',
    HAI_ADDRESS: '0x4567890123456789012345678901234567890123'
  })
}));

const mockCreateClaimedAmountsUseCases = createClaimedAmountsUseCases as jest.MockedFunction<typeof createClaimedAmountsUseCases>;

describe('Reward Processor Service', () => {
  let mockClaimedAmountsUseCases: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClaimedAmountsUseCases = {
      processRewardsWithClaimedAmounts: jest.fn()
    };

    mockCreateClaimedAmountsUseCases.mockReturnValue(mockClaimedAmountsUseCases);
  });

  describe('convertRewardsToBigNumber', () => {
    it('should convert earned values to BigNumber strings', () => {
      const rawResults = {
        KITE: [
          { address: '0x123', earned: 1.5 },
          { address: '0x456', earned: 2.75 }
        ],
        OP: [
          { address: '0x789', earned: 0.25 }
        ]
      };

      const result = convertRewardsToBigNumber(rawResults);

      expect(result.KITE).toHaveLength(2);
      expect(result.KITE[0]).toEqual({
        address: '0x123',
        earned: ethers.utils.parseEther('1.5').toString()
      });
      expect(result.KITE[1]).toEqual({
        address: '0x456',
        earned: ethers.utils.parseEther('2.75').toString()
      });
      expect(result.OP).toHaveLength(1);
      expect(result.OP[0]).toEqual({
        address: '0x789',
        earned: ethers.utils.parseEther('0.25').toString()
      });
    });

    it('should handle empty results', () => {
      const result = convertRewardsToBigNumber({});
      expect(result).toEqual({});
    });
  });

  describe('getTokenAddressMap', () => {
    it('should return correct token address mapping', () => {
      const result = getTokenAddressMap();

      expect(result).toEqual({
        KITE: '0x1234567890123456789012345678901234567890',
        OP: '0x2345678901234567890123456789012345678901',
        DINERO: '0x3456789012345678901234567890123456789012',
        HAI: '0x4567890123456789012345678901234567890123'
      });
    });
  });

  describe('processRewardsWithClaimedAmounts', () => {
    it('should process rewards for all tokens', async () => {
      const adjustedResults = {
        KITE: [
          { address: '0x123', earned: '1500000000000000000' },
          { address: '0x456', earned: '2750000000000000000' }
        ],
        OP: [
          { address: '0x789', earned: '250000000000000000' }
        ]
      };

      const processedKite = [
        { address: '0x123', earned: '1500000000000000000' }
      ];
      const processedOp = [
        { address: '0x789', earned: '250000000000000000' }
      ];

      mockClaimedAmountsUseCases.processRewardsWithClaimedAmounts
        .mockResolvedValueOnce(processedKite)
        .mockResolvedValueOnce(processedOp);

      const result = await processRewardsWithClaimedAmounts(adjustedResults);

      expect(mockClaimedAmountsUseCases.processRewardsWithClaimedAmounts).toHaveBeenCalledTimes(2);
      expect(mockClaimedAmountsUseCases.processRewardsWithClaimedAmounts).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
        adjustedResults.KITE
      );
      expect(mockClaimedAmountsUseCases.processRewardsWithClaimedAmounts).toHaveBeenCalledWith(
        '0x2345678901234567890123456789012345678901',
        adjustedResults.OP
      );

      expect(result.KITE).toEqual(processedKite);
      expect(result.OP).toEqual(processedOp);
    });

    it('should handle case-insensitive token names', async () => {
      const adjustedResults = {
        kite: [
          { address: '0x123', earned: '1500000000000000000' }
        ]
      };

      const processedKite = [
        { address: '0x123', earned: '1500000000000000000' }
      ];

      mockClaimedAmountsUseCases.processRewardsWithClaimedAmounts
        .mockResolvedValueOnce(processedKite);

      const result = await processRewardsWithClaimedAmounts(adjustedResults);

      expect(mockClaimedAmountsUseCases.processRewardsWithClaimedAmounts).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
        adjustedResults.kite
      );

      expect(result.kite).toEqual(processedKite);
    });
  });

  describe('processAllRewards', () => {
    it('should process rewards end-to-end', async () => {
      const rawResults = {
        KITE: [
          { address: '0x123', earned: 1.5 },
          { address: '0x456', earned: 2.75 }
        ]
      };

      const processedKite = [
        { address: '0x123', earned: ethers.utils.parseEther('1.5').toString() }
      ];

      mockClaimedAmountsUseCases.processRewardsWithClaimedAmounts
        .mockResolvedValueOnce(processedKite);

      const result = await processAllRewards(rawResults);

      expect(result.KITE).toEqual(processedKite);
    });
  });
});