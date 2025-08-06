/**
 * Unit tests for merkle root updater service
 */

import { ethers } from 'ethers';
import { updateMerkleRootsWithNotifications } from '../index';
import { executeContractMethodWithNotifications } from '../../transaction-handler';
import { notifyMerkleUpdate } from '../../../modules/telegram-bot';

// Mock dependencies
jest.mock('../../transaction-handler');
jest.mock('../../../modules/telegram-bot');
jest.mock('../../../config', () => ({
  config: () => ({
    KITE_ADDRESS: '0x1234567890123456789012345678901234567890',
    OP_ADDRESS: '0x2345678901234567890123456789012345678901',
    DINERO_ADDRESS: '0x3456789012345678901234567890123456789012',
    HAI_ADDRESS: '0x4567890123456789012345678901234567890123'
  })
}));

const mockExecuteContractMethodWithNotifications = executeContractMethodWithNotifications as jest.MockedFunction<typeof executeContractMethodWithNotifications>;
const mockNotifyMerkleUpdate = notifyMerkleUpdate as jest.MockedFunction<typeof notifyMerkleUpdate>;

describe('Merkle Root Updater Service', () => {
  let mockRewardDistributor: ethers.Contract;
  let mockMerkleTries: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock contract
    mockRewardDistributor = {
      updateMerkleRoots: jest.fn()
    } as any;

    // Mock merkle trees
    mockMerkleTries = {
      KITE: {
        root: '0x1234567890123456789012345678901234567890123456789012345678901234',
        dump: jest.fn()
      },
      OP: {
        root: '0x2345678901234567890123456789012345678901234567890123456789012345',
        dump: jest.fn()
      }
    };

    // Setup default mock implementations
    mockExecuteContractMethodWithNotifications.mockResolvedValue({} as any);
    mockNotifyMerkleUpdate.mockResolvedValue(undefined);
  });

  describe('updateMerkleRootsWithNotifications', () => {
    it('should update merkle roots with notifications for valid tokens', async () => {
      await updateMerkleRootsWithNotifications({
        merkleTries: mockMerkleTries,
        rewardDistributor: mockRewardDistributor
      });

      // Verify contract method was called with correct parameters
      expect(mockExecuteContractMethodWithNotifications).toHaveBeenCalledWith(
        mockRewardDistributor,
        'updateMerkleRoots',
        [
          [
            '0x1234567890123456789012345678901234567890', // KITE address
            '0x2345678901234567890123456789012345678901'  // OP address
          ],
          [
            '0x1234567890123456789012345678901234567890123456789012345678901234', // KITE root
            '0x2345678901234567890123456789012345678901234567890123456789012345'  // OP root
          ]
        ],
        {
          operation: 'Update Merkle Roots',
          details: {
            tokens: ['KITE', 'OP'],
            tokenAddresses: [
              '0x1234567890123456789012345678901234567890',
              '0x2345678901234567890123456789012345678901'
            ],
            tokenCount: 2
          },
          successDetails: {
            tokens: ['KITE', 'OP']
          }
        }
      );

      // Verify merkle update notification was sent
      expect(mockNotifyMerkleUpdate).toHaveBeenCalledWith(
        ['KITE', 'OP'],
        [
          '0x1234567890123456789012345678901234567890123456789012345678901234',
          '0x2345678901234567890123456789012345678901234567890123456789012345'
        ]
      );
    });

    it('should skip tokens with unknown addresses', async () => {
      const merkleTriesWithUnknownToken = {
        ...mockMerkleTries,
        UNKNOWN_TOKEN: {
          root: '0x9999999999999999999999999999999999999999999999999999999999999999',
          dump: jest.fn()
        }
      };

      await updateMerkleRootsWithNotifications({
        merkleTries: merkleTriesWithUnknownToken,
        rewardDistributor: mockRewardDistributor
      });

      // Should only process known tokens
      expect(mockExecuteContractMethodWithNotifications).toHaveBeenCalledWith(
        mockRewardDistributor,
        'updateMerkleRoots',
        [
          [
            '0x1234567890123456789012345678901234567890', // KITE address
            '0x2345678901234567890123456789012345678901'  // OP address
          ],
          [
            '0x1234567890123456789012345678901234567890123456789012345678901234', // KITE root
            '0x2345678901234567890123456789012345678901234567890123456789012345'  // OP root
          ]
        ],
        expect.any(Object)
      );

      // Should not include unknown token in notification
      expect(mockNotifyMerkleUpdate).toHaveBeenCalledWith(
        ['KITE', 'OP'],
        [
          '0x1234567890123456789012345678901234567890123456789012345678901234',
          '0x2345678901234567890123456789012345678901234567890123456789012345'
        ]
      );
    });

    it('should handle empty merkle tries gracefully', async () => {
      await updateMerkleRootsWithNotifications({
        merkleTries: {},
        rewardDistributor: mockRewardDistributor
      });

      // Should not call contract method
      expect(mockExecuteContractMethodWithNotifications).not.toHaveBeenCalled();
      expect(mockNotifyMerkleUpdate).not.toHaveBeenCalled();
    });

    it('should handle only unknown tokens gracefully', async () => {
      const onlyUnknownTokens = {
        UNKNOWN_TOKEN: {
          root: '0x9999999999999999999999999999999999999999999999999999999999999999',
          dump: jest.fn()
        }
      };

      await updateMerkleRootsWithNotifications({
        merkleTries: onlyUnknownTokens,
        rewardDistributor: mockRewardDistributor
      });

      // Should not call contract method
      expect(mockExecuteContractMethodWithNotifications).not.toHaveBeenCalled();
      expect(mockNotifyMerkleUpdate).not.toHaveBeenCalled();
    });

    it('should propagate errors from contract execution', async () => {
      const error = new Error('Contract execution failed');
      mockExecuteContractMethodWithNotifications.mockRejectedValue(error);

      await expect(
        updateMerkleRootsWithNotifications({
          merkleTries: mockMerkleTries,
          rewardDistributor: mockRewardDistributor
        })
      ).rejects.toThrow('Contract execution failed');

      // Should not call merkle update notification on error
      expect(mockNotifyMerkleUpdate).not.toHaveBeenCalled();
    });

    it('should propagate errors from merkle update notification', async () => {
      const error = new Error('Notification failed');
      mockNotifyMerkleUpdate.mockRejectedValue(error);

      await expect(
        updateMerkleRootsWithNotifications({
          merkleTries: mockMerkleTries,
          rewardDistributor: mockRewardDistributor
        })
      ).rejects.toThrow('Notification failed');
    });
  });
}); 