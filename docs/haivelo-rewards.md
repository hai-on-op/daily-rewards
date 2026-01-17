# haiVELO Rewards Calculation

## Overview

The haiVELO rewards system distributes rewards to users based on their **haiVELO weight**, which combines two sources: direct haiVELO collateral deposits and haiVELO-VELO LP token staking. Both sources are converted to a common haiVELO-equivalent weight to ensure fair reward distribution.

## Weight Calculation

**Collateral Weight**: Each haiVELO deposited as collateral equals 1 weight. This is a straightforward 1:1 relationship.

**LP Staking Weight**: LP tokens are converted to their haiVELO-equivalent using the formula:

```
haiVELO per LP = reserve0 (haiVELO in pool) / total LP supply
LP weight = LP tokens staked × haiVELO per LP
```

For example, if a pool contains 10,061 haiVELO and has 8,659 LP tokens in circulation, each LP token represents approximately 1.16 haiVELO. A user staking 100 LP tokens would have a weight of 116 haiVELO-equivalent.

## Dynamic Price Tracking

The system dynamically tracks changes in the haiVELO per LP ratio by monitoring pool sync events. Whenever the pool reserves change (due to swaps, adds, or removes), all LP stakers' weights are recalculated using the new ratio. This ensures that rewards are always distributed based on the current haiVELO value of LP positions, not a stale value from when tokens were staked.

## KITE Boost

Users can receive up to a 2x boost on their rewards based on their KITE staking position. The boost is calculated by comparing the user's share of total KITE staked to their share of total haiVELO weight. Users with a proportionally higher KITE stake relative to their haiVELO weight receive a larger boost, incentivizing balanced participation in both systems.

