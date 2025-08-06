import { MinterRewardConfig, MinterRewardPeriodConfig, TimedMinterRewardConfig } from '../config/types';

export interface BlockPeriod {
  fromBlock: number;
  toBlock: number;
  config: MinterRewardConfig;
}

/**
 * Resolves the configuration for a specific block number
 */
export function getConfigForBlock(
  timedConfig: TimedMinterRewardConfig,
  blockNumber: number
): MinterRewardConfig | null {
  const period = timedConfig.periods.find(period => {
    const inRange = blockNumber >= period.fromBlock;
    const beforeEnd = period.toBlock === undefined || blockNumber <= period.toBlock;
    return inRange && beforeEnd;
  });

  return period ? period.config : null;
}

/**
 * Splits a block range into periods based on the time-based configuration
 */
export function splitBlockRangeIntoPeriods(
  timedConfig: TimedMinterRewardConfig,
  fromBlock: number,
  toBlock: number
): BlockPeriod[] {
  const periods: BlockPeriod[] = [];
  
  // Sort periods by fromBlock to ensure proper ordering
  const sortedPeriods = [...timedConfig.periods].sort((a, b) => a.fromBlock - b.fromBlock);
  
  let currentBlock = fromBlock;
  
  for (const period of sortedPeriods) {
    // Skip periods that end before our range starts
    if (period.toBlock !== undefined && period.toBlock < fromBlock) {
      continue;
    }
    
    // Skip periods that start after our range ends
    if (period.fromBlock > toBlock) {
      break;
    }
    
    // Calculate the intersection of the period with our range
    const periodStart = Math.max(period.fromBlock, currentBlock);
    const periodEnd = period.toBlock === undefined 
      ? toBlock 
      : Math.min(period.toBlock, toBlock);
    
    if (periodStart <= periodEnd) {
      periods.push({
        fromBlock: periodStart,
        toBlock: periodEnd,
        config: period.config
      });
      
      currentBlock = periodEnd + 1;
    }
    
    // If we've covered the entire range, break
    if (currentBlock > toBlock) {
      break;
    }
  }
  
  return periods;
}

/**
 * Validates that the time-based configuration is properly structured
 */
export function validateTimedMinterConfig(timedConfig: TimedMinterRewardConfig): string[] {
  const errors: string[] = [];
  
  if (!timedConfig.periods || timedConfig.periods.length === 0) {
    errors.push('TimedMinterRewardConfig must have at least one period');
    return errors;
  }
  
  // Sort periods by fromBlock for validation
  const sortedPeriods = [...timedConfig.periods].sort((a, b) => a.fromBlock - b.fromBlock);
  
  for (let i = 0; i < sortedPeriods.length; i++) {
    const period = sortedPeriods[i];
    
    // Validate individual period
    if (period.fromBlock < 0) {
      errors.push(`Period ${i}: fromBlock must be non-negative`);
    }
    
    if (period.toBlock !== undefined && period.toBlock < period.fromBlock) {
      errors.push(`Period ${i}: toBlock must be greater than or equal to fromBlock`);
    }
    
    // Check for overlaps with next period
    if (i < sortedPeriods.length - 1) {
      const nextPeriod = sortedPeriods[i + 1];
      
      if (period.toBlock === undefined) {
        errors.push(`Period ${i}: Only the last period can have undefined toBlock (infinite)`);
      } else if (period.toBlock >= nextPeriod.fromBlock) {
        errors.push(`Periods ${i} and ${i + 1}: Overlapping or adjacent periods detected`);
      }
    }
  }
  
  return errors;
}

/**
 * Creates a legacy-compatible configuration from a time-based config for a specific block range
 */
export function getLegacyConfigForRange(
  timedConfig: TimedMinterRewardConfig,
  fromBlock: number,
  toBlock: number
): MinterRewardConfig | null {
  const periods = splitBlockRangeIntoPeriods(timedConfig, fromBlock, toBlock);
  
  if (periods.length === 0) {
    return null;
  }
  
  if (periods.length === 1) {
    return periods[0].config;
  }
  
  // If multiple periods exist, we cannot provide a single legacy config
  // This should trigger the new calculation logic
  return null;
} 