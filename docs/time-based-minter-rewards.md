# Time-Based Minter Rewards Configuration

This document describes the new time-based configuration system for minter rewards that allows different reward rates for different block ranges.

## Overview

The time-based minter rewards system allows you to:
- Define different reward configurations for different block ranges
- Change reward rates over time without affecting historical calculations
- Support multiple periods with different token distributions
- Maintain backward compatibility with the legacy configuration system

## Configuration Structure

### Environment Variable

Set the `REWARD_MINTER_TIMED_CONFIG` environment variable with a JSON configuration:

```bash
REWARD_MINTER_TIMED_CONFIG='{"periods": [...]}'
```

### Configuration Schema

```typescript
interface TimedMinterRewardConfig {
  periods: MinterRewardPeriodConfig[];
}

interface MinterRewardPeriodConfig {
  fromBlock: number;
  toBlock?: number; // undefined means "to infinity"
  config: MinterRewardConfig;
}

interface MinterRewardConfig {
  [rewardToken: string]: {
    [collateralType: string]: number; // daily reward amount
  };
}
```

## Example Configurations

### Basic Example

```json
{
  "periods": [
    {
      "fromBlock": 1000000,
      "toBlock": 2000000,
      "config": {
        "KITE": {
          "WETH": 100,
          "RETH": 50
        }
      }
    },
    {
      "fromBlock": 2000001,
      "toBlock": 3000000,
      "config": {
        "KITE": {
          "WETH": 200,
          "RETH": 100
        },
        "OP": {
          "WETH": 50
        }
      }
    },
    {
      "fromBlock": 3000001,
      "config": {
        "KITE": {
          "WETH": 150,
          "RETH": 75
        },
        "OP": {
          "WETH": 75
        },
        "DINERO": {
          "TOTEM": 25
        }
      }
    }
  ]
}
```

### Real-World Scenario

```json
{
  "periods": [
    {
      "fromBlock": 14461892,
      "toBlock": 18000000,
      "config": {
        "KITE": {
          "WETH": 100,
          "RETH": 80,
          "WSTETH": 80,
          "APXETH": 60
        }
      }
    },
    {
      "fromBlock": 18000001,
      "toBlock": 22000000,
      "config": {
        "KITE": {
          "WETH": 150,
          "RETH": 120,
          "WSTETH": 120,
          "APXETH": 90
        },
        "OP": {
          "WETH": 50,
          "RETH": 40
        }
      }
    },
    {
      "fromBlock": 22000001,
      "config": {
        "KITE": {
          "WETH": 200,
          "RETH": 160,
          "WSTETH": 160,
          "APXETH": 120
        },
        "OP": {
          "WETH": 100,
          "RETH": 80,
          "WSTETH": 80
        },
        "DINERO": {
          "TOTEM": 50,
          "STONES": 30
        }
      }
    }
  ]
}
```

## Key Features

### 1. Multiple Time Periods
- Define as many periods as needed
- Each period has a start block and optional end block
- The last period can be open-ended (no `toBlock`)

### 2. Different Reward Tokens per Period
- Add new reward tokens in later periods
- Remove or modify existing tokens between periods
- Each period is completely independent

### 3. Automatic Period Processing
- The system automatically splits your query range into relevant periods
- Calculates rewards for each period separately
- Merges results to provide cumulative rewards

### 4. Validation
- Automatic validation of configuration structure
- Checks for overlapping periods
- Ensures proper block ordering
- Validates that only the last period can be infinite

## Backward Compatibility

The system maintains full backward compatibility:
- If `REWARD_MINTER_TIMED_CONFIG` is not set, it uses the legacy `REWARD_MINTER_CONFIG`
- Existing configurations continue to work unchanged
- No migration required for current setups

## Usage Examples

### Setting Environment Variables

```bash
# Legacy configuration (still supported)
export REWARD_MINTER_CONFIG='{"KITE": {"WETH": 100, "RETH": 50}}'

# New time-based configuration
export REWARD_MINTER_TIMED_CONFIG='{"periods": [{"fromBlock": 1000000, "config": {"KITE": {"WETH": 100}}}]}'
```

### Querying Specific Ranges

The system automatically handles:
- Queries that span multiple periods
- Queries within a single period
- Queries that extend beyond configured periods

```typescript
// This will automatically process all relevant periods
const rewards = await calculateMinterRewards(1500000, 2500000);
```

## Migration Guide

### From Legacy to Time-Based

1. **Keep Current Setup**: Your existing configuration continues to work
2. **Add Time-Based Config**: Set `REWARD_MINTER_TIMED_CONFIG` when ready
3. **Test**: The system will automatically use the time-based config when available
4. **Remove Legacy**: Optionally remove `REWARD_MINTER_CONFIG` after migration

### Example Migration

Legacy configuration:
```bash
REWARD_MINTER_CONFIG='{"KITE": {"WETH": 100, "RETH": 50}}'
```

Equivalent time-based configuration:
```bash
REWARD_MINTER_TIMED_CONFIG='{"periods": [{"fromBlock": 14461892, "config": {"KITE": {"WETH": 100, "RETH": 50}}}]}'
```

## Best Practices

1. **Plan Ahead**: Design your periods with future changes in mind
2. **Use Clear Block Numbers**: Use specific block numbers for period boundaries
3. **Test Configuration**: Validate your JSON before deployment
4. **Document Changes**: Keep track of when and why you change reward rates
5. **Monitor Transitions**: Pay attention to period boundary blocks

## Troubleshooting

### Common Issues

1. **Overlapping Periods**: Ensure periods don't overlap
2. **Missing Periods**: Ensure all queried block ranges are covered
3. **Invalid JSON**: Validate your configuration JSON
4. **Block Order**: Ensure periods are in ascending block order

### Error Messages

- `"No configuration found for block range X to Y"`: Add a period covering this range
- `"Overlapping or adjacent periods detected"`: Fix period boundaries
- `"Only the last period can have undefined toBlock"`: Set `toBlock` for all but the last period

## Performance Considerations

- The system processes each period separately, which may increase processing time for ranges spanning many periods
- Consider consolidating periods with identical configurations
- Monitor resource usage when processing large block ranges with many periods