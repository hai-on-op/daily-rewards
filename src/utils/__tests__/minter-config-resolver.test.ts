import {
  getConfigForBlock,
  splitBlockRangeIntoPeriods,
  validateTimedMinterConfig,
  getLegacyConfigForRange
} from '../minter-config-resolver';
import { TimedMinterRewardConfig } from '../../config/types';

describe('minter-config-resolver', () => {
  const mockTimedConfig: TimedMinterRewardConfig = {
    periods: [
      {
        fromBlock: 1000,
        toBlock: 2000,
        config: {
          KITE: { WETH: 100, RETH: 50 }
        }
      },
      {
        fromBlock: 2001,
        toBlock: 3000,
        config: {
          KITE: { WETH: 200, RETH: 100 },
          OP: { WETH: 50 }
        }
      },
      {
        fromBlock: 3001,
        config: {
          KITE: { WETH: 150 },
          DINERO: { TOTEM: 25 }
        }
      }
    ]
  };

  describe('getConfigForBlock', () => {
    it('should return correct config for block in first period', () => {
      const config = getConfigForBlock(mockTimedConfig, 1500);
      expect(config).toEqual({
        KITE: { WETH: 100, RETH: 50 }
      });
    });

    it('should return correct config for block in second period', () => {
      const config = getConfigForBlock(mockTimedConfig, 2500);
      expect(config).toEqual({
        KITE: { WETH: 200, RETH: 100 },
        OP: { WETH: 50 }
      });
    });

    it('should return correct config for block in infinite period', () => {
      const config = getConfigForBlock(mockTimedConfig, 5000);
      expect(config).toEqual({
        KITE: { WETH: 150 },
        DINERO: { TOTEM: 25 }
      });
    });

    it('should return null for block before first period', () => {
      const config = getConfigForBlock(mockTimedConfig, 500);
      expect(config).toBeNull();
    });

    it('should return correct config for block at period boundaries', () => {
      expect(getConfigForBlock(mockTimedConfig, 1000)).toEqual({
        KITE: { WETH: 100, RETH: 50 }
      });
      expect(getConfigForBlock(mockTimedConfig, 2000)).toEqual({
        KITE: { WETH: 100, RETH: 50 }
      });
      expect(getConfigForBlock(mockTimedConfig, 2001)).toEqual({
        KITE: { WETH: 200, RETH: 100 },
        OP: { WETH: 50 }
      });
    });
  });

  describe('splitBlockRangeIntoPeriods', () => {
    it('should split range spanning multiple periods', () => {
      const periods = splitBlockRangeIntoPeriods(mockTimedConfig, 1500, 2500);
      expect(periods).toHaveLength(2);

      expect(periods[0]).toEqual({
        fromBlock: 1500,
        toBlock: 2000,
        config: { KITE: { WETH: 100, RETH: 50 } }
      });

      expect(periods[1]).toEqual({
        fromBlock: 2001,
        toBlock: 2500,
        config: { KITE: { WETH: 200, RETH: 100 }, OP: { WETH: 50 } }
      });
    });

    it('should handle range within single period', () => {
      const periods = splitBlockRangeIntoPeriods(mockTimedConfig, 1200, 1800);
      expect(periods).toHaveLength(1);

      expect(periods[0]).toEqual({
        fromBlock: 1200,
        toBlock: 1800,
        config: { KITE: { WETH: 100, RETH: 50 } }
      });
    });

    it('should handle range extending into infinite period', () => {
      const periods = splitBlockRangeIntoPeriods(mockTimedConfig, 2500, 5000);
      expect(periods).toHaveLength(2);

      expect(periods[1]).toEqual({
        fromBlock: 3001,
        toBlock: 5000,
        config: { KITE: { WETH: 150 }, DINERO: { TOTEM: 25 } }
      });
    });

    it('should return empty array for range before first period', () => {
      const periods = splitBlockRangeIntoPeriods(mockTimedConfig, 100, 500);
      expect(periods).toHaveLength(0);
    });

    it('should handle range exactly matching period boundaries', () => {
      const periods = splitBlockRangeIntoPeriods(mockTimedConfig, 1000, 2000);
      expect(periods).toHaveLength(1);

      expect(periods[0]).toEqual({
        fromBlock: 1000,
        toBlock: 2000,
        config: { KITE: { WETH: 100, RETH: 50 } }
      });
    });
  });

  describe('validateTimedMinterConfig', () => {
    it('should return no errors for valid config', () => {
      const errors = validateTimedMinterConfig(mockTimedConfig);
      expect(errors).toHaveLength(0);
    });

    it('should return error for empty periods', () => {
      const invalidConfig: TimedMinterRewardConfig = { periods: [] };
      const errors = validateTimedMinterConfig(invalidConfig);
      expect(errors).toContain('TimedMinterRewardConfig must have at least one period');
    });

    it('should return error for overlapping periods', () => {
      const invalidConfig: TimedMinterRewardConfig = {
        periods: [
          {
            fromBlock: 1000,
            toBlock: 2000,
            config: { KITE: { WETH: 100 } }
          },
          {
            fromBlock: 1500,
            toBlock: 2500,
            config: { KITE: { WETH: 200 } }
          }
        ]
      };
      const errors = validateTimedMinterConfig(invalidConfig);
      expect(errors.some(error => error.includes('Overlapping'))).toBe(true);
    });

    it('should return error for toBlock less than fromBlock', () => {
      const invalidConfig: TimedMinterRewardConfig = {
        periods: [
          {
            fromBlock: 2000,
            toBlock: 1000,
            config: { KITE: { WETH: 100 } }
          }
        ]
      };
      const errors = validateTimedMinterConfig(invalidConfig);
      expect(errors.some(error => error.includes('toBlock must be greater than or equal to fromBlock'))).toBe(true);
    });

    it('should return error for multiple infinite periods', () => {
      const invalidConfig: TimedMinterRewardConfig = {
        periods: [
          {
            fromBlock: 1000,
            config: { KITE: { WETH: 100 } }
          },
          {
            fromBlock: 2000,
            config: { KITE: { WETH: 200 } }
          }
        ]
      };
      const errors = validateTimedMinterConfig(invalidConfig);
      expect(errors.some(error => error.includes('Only the last period can have undefined toBlock'))).toBe(true);
    });
  });

  describe('getLegacyConfigForRange', () => {
    it('should return config for range within single period', () => {
      const config = getLegacyConfigForRange(mockTimedConfig, 1200, 1800);
      expect(config).toEqual({
        KITE: { WETH: 100, RETH: 50 }
      });
    });

    it('should return null for range spanning multiple periods', () => {
      const config = getLegacyConfigForRange(mockTimedConfig, 1500, 2500);
      expect(config).toBeNull();
    });

    it('should return null for range with no matching periods', () => {
      const config = getLegacyConfigForRange(mockTimedConfig, 100, 500);
      expect(config).toBeNull();
    });
  });
});