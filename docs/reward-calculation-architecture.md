# Reward Calculation Architecture

## Overview

The reward distribution system calculates time-weighted rewards for users across 5 strategies. Each strategy tracks different on-chain positions (collateral, debt, LP tokens) and distributes rewards proportionally to users' stake over time.

---

## Layers

```
Orchestrator (cli.ts)
    |
    v
CalculateRewardsStep
    |
    v
result-combiner.ts (combineResults)
    |
    +---> calculateHaiveloRewardsV2()     ---> HaiVeloStrategy
    +---> calculateHaiaeroRewardsV2()     ---> HaiAeroStrategy
    +---> calculateMinterRewardsV2()      ---> MinterStrategy (per window x cType)
    +---> calculateLpStakingRewardsV2()   ---> LpStakingStrategy (per window x stakingType)
    +---> calculateLpRewardsV2()          ---> LpStrategy (historical only)
    |
    v
combineRewards() --> merge all into single RewardsMap
    |
    v
GenerateMerkleTreesStep --> UpdateOnChainStep --> BackupStep --> CloudUploadStep
```

---

## Core Abstractions

### RewardStrategy\<TEvent, TUserState\>

Interface at `src/core/interfaces/IRewardStrategy.ts`. Each strategy implements:

| Method | Purpose |
|--------|---------|
| `getInitialUsers(blockRange)` | Fetch user positions at start of period |
| `getEvents(blockRange)` | Fetch state-changing events within period |
| `getWeight(state)` | Calculate user's reward weight from their state |
| `createDefaultState(address)` | Create zero-state for new users mid-period |
| `applyEvent(event, users)` | Update user state when an event occurs |
| `calculateBoosts(users, timestamp)` | Compute KITE staking boost multipliers |
| `shouldCreditAllUsers(event)` | Whether to credit all users or just the affected one |
| `getAdditionalCredits(event, users)` | Extra users to credit before state change (NFT transfers) |

### TimeWeightedDistributor

Engine at `src/core/rewards/TimeWeightedDistributor.ts`. Implements the shared distribution algorithm:

```
rewardRate = rewardAmount / (endTimestamp - startTimestamp)
rewardPerWeight = 0

For each event in chronological order:
    1. Accumulate rewardPerWeight based on time elapsed and total weight
    2. Credit users: earned += (rewardPerWeight - stored) * weight * boost
    3. Apply event to user state (strategy-specific)
    4. Recalculate total weight

Final credit at endTimestamp
```

### calculateStrategyRewards()

Wiring function at `src/core/rewards/calculateRewards.ts`. Connects the pieces:

1. Convert block range to timestamps via provider
2. Call `strategy.getInitialUsers()` and `strategy.getEvents()`
3. Pass to `TimeWeightedDistributor.distribute()`
4. Return `Map<address, earned>`

---

## Strategies

### 1. HaiAero (`src/core/rewards/strategies/HaiAeroStrategy.ts`)

**What it tracks:** haiAERO collateral deposits

| Aspect | Detail |
|--------|--------|
| User state | `{ collateral }` |
| Weight | `collateral` (1:1) |
| Events | Collateral deposit/withdraw from subgraph |
| Boost | `min(kiteShare / collateralShare + 1, 2)` |
| Crediting | All users per event |
| Windows | Single |

### 2. HaiVelo (`src/core/rewards/strategies/HaiVeloStrategy.ts`)

**What it tracks:** haiVELO collateral + LP staking in HAI-VELO-VELO pool

| Aspect | Detail |
|--------|--------|
| User state | `{ collateral, lpStakedRaw }` |
| Weight | `collateral + (lpStakedRaw * haiVeloPerLp)` |
| Events | 3 types: COLLATERAL, LP_STAKING, PRICE_UPDATE |
| Boost | `min(kiteShare / weightShare + 1, 2)` |
| Crediting | All users per event |
| Windows | Single |
| Special | PRICE_UPDATE events update the LP-to-haiVELO conversion ratio, changing all users' weights without modifying their state |

### 3. Minter (`src/core/rewards/strategies/MinterStrategy.ts`)

**What it tracks:** Safe debt positions per collateral type

| Aspect | Detail |
|--------|--------|
| User state | `{ debt, collateral, totalBridgedTokens }` |
| Weight | `debt` (with `withBridge=false`) |
| Events | 2 types: DELTA_DEBT, UPDATE_ACCUMULATED_RATE |
| Boost | `min(debtShare + 1, 2)` — cached per timestamp |
| Crediting | DELTA_DEBT: single user only. UPDATE_ACCUMULATED_RATE: all users |
| Windows | Multiple — iterates `config.rewards.minter.windows[]` |
| Special | Rate events multiply ALL users' debt by `(rateMultiplier + 1)`. Reward amount calculated from `dailyRate * blockCount / blocksPerDay` |

### 4. LP Staking (`src/core/rewards/strategies/LpStakingStrategy.ts`)

**What it tracks:** Staked LP tokens (HAI_BOLD_CURVE, HAI_VELO_VELO)

| Aspect | Detail |
|--------|--------|
| User state | `{ lpStaked }` |
| Weight | `lpStaked` (1:1) |
| Events | STAKE / WITHDRAW events by timestamp |
| Boost | `min(kiteShare / lpStakeShare + 1, 2)` |
| Crediting | All users per event |
| Windows | Multiple — iterates `config.rewards.lpStaking.windows[]` |

### 5. LP (`src/core/rewards/strategies/LpStrategy.ts`)

**What it tracks:** Uniswap V3 LP positions + safe debt

| Aspect | Detail |
|--------|--------|
| User state | `{ debt, lpPositions[] }` |
| Weight | Sum of liquidity for full-range positions only (ticks -887220 to 887220) |
| Events | 4 types: DELTA_DEBT, POOL_POSITION_UPDATE, POOL_SWAP, UPDATE_ACCUMULATED_RATE |
| Boost | `min(kiteShare / (weight / totalLPLiquidity) + 1, 2)` — cached per timestamp |
| Crediting | DELTA_DEBT + POOL_POSITION_UPDATE: single user. POOL_SWAP + UPDATE_ACCUMULATED_RATE: all users |
| Windows | Single (historical only) |
| Special | Detects NFT transfers (position moving between users). Previous owner credited before position removal. Accumulated rate events multiply all debts |

---

## Boost System

All strategies use KITE staking to boost rewards. The general formula:

```
boost = min(userKiteShare / userPositionShare + 1, 2)
```

- `userKiteShare` = user's % of total staked KITE (from sKITE subgraph)
- `userPositionShare` = user's % of total position weight (varies by strategy)
- Range: [1.0, 2.0] — staking KITE can at most double your rewards
- Users with no KITE staked get boost = 1.0 (no penalty, no bonus)

Boosts are recalculated at each event's timestamp. Some strategies cache boosts per timestamp to avoid redundant calculations.

---

## Multi-Window Support

Minter and LP Staking support multiple time windows, each with different reward configurations:

```
Window 0: blocks 137678333 → 140142515, config: { KITE: { HAIVELO: 50, ALETH: 50 } }
Window 1: blocks 140142516 → 140398782, config: { KITE: { HAIVELO: 50, ALETH: 50, MSETH: 25 } }
...
```

For each window:
1. Calculate `rewardAmount = (dailyRate / 43200) * totalBlocks`
2. Create strategy instance for the specific collateral/staking type
3. Run `calculateStrategyRewards()`
4. Merge earned amounts across windows (accumulate per address)

---

## Result Combination

`result-combiner.ts` orchestrates all reward calculations:

1. **Fetch token transfers** (Alchemy SDK) for haiVELO and haiAERO deposit tracking
2. **Calculate rewards** from all 5 sources in parallel
3. **Merge** using `combineRewards()`: for each reward token (KITE, OP, HAI, etc.), sum earned amounts per address across all strategies
4. **Filter** zero/negative values

The output `RewardsMap` is:
```ts
{
  KITE: [{ address: "0x...", earned: 1234.56 }, ...],
  OP:   [{ address: "0x...", earned: 789.01 }, ...],
  HAI:  [{ address: "0x...", earned: 456.78 }, ...],
}
```

This feeds into merkle tree generation, on-chain root updates, and Cloudflare uploads for the claims frontend.

---

## Data Flow Per Strategy

```
Subgraph / RPC
    |
    v
strategy.getInitialUsers()  -->  Map<address, TUserState>
strategy.getEvents()         -->  TEvent[]
    |
    v
TimeWeightedDistributor.distribute()
    |
    |  For each event:
    |    1. Accumulate reward per weight (time * rate / totalWeight)
    |    2. Credit affected users (earned += delta * weight * boost)
    |    3. Apply state change (strategy-specific)
    |    4. Recalculate weights and boosts
    |
    v
Map<address, earned>
    |
    v
V2 Wrapper: convert to UserList for backward compatibility
    |
    v
result-combiner.ts: merge across strategies
```

---

## File Map

```
src/core/
├── interfaces/
│   ├── IRewardStrategy.ts      # Strategy interface + BlockRange, StrategyEvent
│   └── index.ts                # Barrel exports
└── rewards/
    ├── TimeWeightedDistributor.ts   # Shared distribution engine
    ├── calculateRewards.ts          # Wiring: strategy + provider → earned map
    ├── types.ts                     # Per-strategy state + event types
    └── strategies/
        ├── HaiAeroStrategy.ts
        ├── HaiVeloStrategy.ts
        ├── MinterStrategy.ts
        ├── LpStakingStrategy.ts
        └── LpStrategy.ts

src/modules/
├── haiaero-rewards-v2.ts       # V2 wrapper → backward compat with result-combiner
├── haivelo-rewards-v2.ts
├── minter-rewards-v2.ts
├── lp-staking-rewards-v2.ts
├── lp-rewards-v2.ts
└── result-combiner.ts          # Orchestrates all calculations, merges results
```
