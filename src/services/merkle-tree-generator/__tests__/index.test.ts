/**
 * Unit tests for merkle tree generator service
 */

import { generateMerkleTrees } from '../index';
import { ProcessedRewardResults } from '../../reward-processor';

describe('Merkle Tree Generator Service', () => {
  describe('generateMerkleTrees', () => {
    it('should generate merkle trees from processed rewards', () => {
      const finalResults: ProcessedRewardResults = {
        KITE: [
          { address: '0x1234567890123456789012345678901234567890', earned: '1000000000000000000' },
          { address: '0x2345678901234567890123456789012345678901', earned: '2000000000000000000' }
        ],
        OP: [
          { address: '0x3456789012345678901234567890123456789012', earned: '500000000000000000' }
        ]
      };

      const result = generateMerkleTrees(finalResults);

      expect(result).toHaveProperty('KITE');
      expect(result).toHaveProperty('OP');
      expect(result.KITE).toHaveProperty('root');
      expect(result.KITE).toHaveProperty('dump');
      expect(result.OP).toHaveProperty('root');
      expect(result.OP).toHaveProperty('dump');
      
      expect(typeof result.KITE.root).toBe('string');
      expect(typeof result.OP.root).toBe('string');
      expect(typeof result.KITE.dump).toBe('function');
      expect(typeof result.OP.dump).toBe('function');
    });

    it('should handle empty results', () => {
      const result = generateMerkleTrees({});
      expect(result).toEqual({});
    });

    it('should generate different roots for different data', () => {
      const results1: ProcessedRewardResults = {
        KITE: [
          { address: '0x123', earned: '1000000000000000000' }
        ]
      };

      const results2: ProcessedRewardResults = {
        KITE: [
          { address: '0x123', earned: '2000000000000000000' }
        ]
      };

      const trees1 = generateMerkleTrees(results1);
      const trees2 = generateMerkleTrees(results2);

      expect(trees1.KITE.root).not.toBe(trees2.KITE.root);
    });
  });
}); 