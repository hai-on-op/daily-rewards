# Daily Rewards Boost Audit Handoff

Date: 2026-05-02

## Context

We already fixed the known KITE overclaim issue caused by incomplete claim accounting. The next concern is different: whether the reward boost implementation itself matches the intended business logic.

The specific question is:

> Is the KITE boost being calculated and applied correctly across all reward strategies?

No production reward formulas were changed in this pass. The work added audit tooling and tests so we can see the current behavior clearly before deciding what to fix.

## What Was Added

New audit command:

```bash
yarn audit:boosts
```

This writes a local audit bundle under:

```bash
audit-output/boost-audit-<timestamp>/
```

That directory is intentionally gitignored. Regenerate it when needed.

Generated files include:

- `boost-audit-report.md`
- `boost-policy-matrix.md`
- `boost-scenarios.json`
- `boost-audit-bundle.json`

Code added:

- `src/services/boost-audit/boostAudit.ts`
- `src/services/boost-audit/boostAudit.test.ts`
- `src/scripts/audit-boosts.ts`

Updated:

- `package.json` with `audit:boosts`
- Strategy tests documenting current boost behavior
- `TimeWeightedDistributor.test.ts` documenting a timing issue

## Current Boost Findings

### 1. Minter boost ignores stKITE

Current minter boost logic is:

```ts
boost = min(debtShare + 1, 2)
```

It does not read stKITE positions at all.

This may be intentional, but it conflicts with the general docs that describe boost as:

```ts
boost = min(userKiteShare / userPositionShare + 1, 2)
```

Files:

- `src/core/rewards/strategies/MinterStrategy.ts`
- `docs/reward-calculation-architecture.md`

Decision needed: should minter rewards use stKITE like the other strategies?

### 2. Boost denominator and credit boost can come from different times

`TimeWeightedDistributor` currently advances reward-per-weight using the previous interval's total boosted weight, then recalculates boosts at the event timestamp before crediting users for that elapsed interval.

That means the denominator can be based on one boost state while the actual user credit uses a different boost state.

A new test documents that this can distribute more than the intended reward budget in a synthetic case.

File:

- `src/core/rewards/TimeWeightedDistributor.ts`

This is the most important implementation concern to investigate next.

### 3. LP boost denominator includes non-full-range liquidity

LP rewards only count full-range Uniswap V3 liquidity as reward weight.

But LP boost denominator currently sums all LP liquidity, including non-full-range positions.

File:

- `src/core/rewards/strategies/LpStrategy.ts`

Decision needed: should non-full-range LP liquidity dilute the boost denominator?

### 4. stKITE events are not reward timeline events

Strategies calculate boosts from stKITE state at a timestamp, but stKITE stake/withdraw events are not inserted into the reward event timeline.

So if only KITE stake changes but the user's reward position does not, boost may not update until another strategy event occurs.

Decision needed: should boost changes take effect immediately at stKITE event timestamps?

### 5. Final interval uses last strategy-event timestamp

The final reward interval uses the last strategy-event timestamp when calculating boost, not the reward period `endTimestamp`.

This matters if stKITE changed after the last strategy event.

File:

- `src/core/rewards/TimeWeightedDistributor.ts`

## Validation Run

These checks passed after adding the audit tooling:

```bash
yarn audit:boosts
yarn build
yarn test --runInBand
git diff --check
```

Full test result:

- 30 test suites passed
- 241 tests passed

## Important: What This Does Not Yet Prove

This audit tooling proves what the code currently does. It does not yet prove what historical user impact would be if we changed the boost formulas.

Before changing production formulas, we should run a backtest that compares:

- current implementation
- proposed corrected implementation
- per-token total emissions
- per-user deltas
- top winners and losers
- historical Merkle output differences

## Recommended Next Step

Build a boost backtest/diff script before changing production reward formulas.

The script should answer:

1. For a selected historical run, what did current code allocate?
2. What would corrected boost logic allocate?
3. Which users gain or lose, and by how much?
4. Does total emitted reward remain capped at the configured reward amount?
5. Are the differences material enough to require reconciliation?

After that, fix the formulas in this order if policy confirms the docs:

1. Fix `TimeWeightedDistributor` interval accounting so denominator and credit boost use the same boost snapshot.
2. Decide and fix minter boost if it should use stKITE.
3. Decide and fix LP boost denominator if it should use only reward-eligible liquidity.
4. Add stKITE stake/withdraw events to the reward timeline if boost changes should take effect immediately.
5. Re-run the audit and backtest before deploying.

