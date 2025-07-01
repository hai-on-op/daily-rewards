/**
 * Utility functions for configuration operations
 */

/**
 * Multiplies all numeric values in a configuration object by a given multiplier
 * @param config - The configuration object containing numeric values
 * @param multiplier - The multiplier to apply to all values
 * @returns A new configuration object with multiplied values
 */
export function multiplyConfigValues(config: any, multiplier: number): any {
  const result: any = {};

  for (const [token, amount] of Object.entries(config)) {
    result[token] = (amount as number) * multiplier;
  }

  return result;
} 