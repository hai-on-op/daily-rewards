# Boost Audit Report

Generated at: 2026-05-03T02:51:44.636Z

This report documents current boost behavior and highlights places where the implementation needs policy confirmation.

# Findings

## HIGH: Minter boost ignores stKITE

Evidence: MinterStrategy.calculateBoosts uses min(debtShare + 1, 2), while the architecture doc says the general boost formula uses user KITE share divided by user position share.

Recommendation: Confirm intended minter policy. If minter should use KITE staking, replace the debt-share boost and backtest historical minter KITE distributions.

## MEDIUM: LP boost denominator includes non-full-range liquidity

Evidence: LpStrategy rewards full-range liquidity, but its boost denominator sums all LP liquidity before dividing the full-range user weight.

Recommendation: Confirm whether non-full-range liquidity should dilute the LP boost denominator. If not, denominator should match reward-eligible full-range weight.

## MEDIUM: KITE stake changes are not strategy events

Evidence: TimeWeightedDistributor recalculates boosts at strategy event timestamps. stKITE stake and withdraw events are read by calculateBoosts, but they are not inserted into the strategy event stream.

Recommendation: Confirm whether boost changes should take effect immediately at stKITE event timestamps. If yes, add KITE staking events to the distribution timeline.

## HIGH: Boost denominator and credit boost can come from different times

Evidence: TimeWeightedDistributor advances rewardPerWeight using the prior total boosted weight, then recalculates boosts at the event timestamp before crediting users for the elapsed interval.

Recommendation: Confirm intended timing. If boosts can change between strategy events, credit elapsed rewards with the same boost set used in the denominator, then recalculate boosts for the next interval.

## MEDIUM: Final interval uses the last strategy-event timestamp for boost lookup

Evidence: The final credit path calls calculateBoosts(users, timestamp), where timestamp is still the last processed strategy event timestamp.

Recommendation: Confirm whether the final interval should use endTimestamp for boost lookup, especially when KITE staking changes after the last strategy event.


# Deterministic Scenario Results

## equal-position-no-kite / haiAERO

- 0xalice: boost=1, docsFormulaBoost=1, rewardShare=50.0000%, docsFormulaShare=50.0000%
- 0xbob: boost=1, docsFormulaBoost=1, rewardShare=50.0000%, docsFormulaShare=50.0000%

## equal-position-no-kite / haiVELO

- 0xalice: boost=1, docsFormulaBoost=1, rewardShare=50.0000%, docsFormulaShare=50.0000%
- 0xbob: boost=1, docsFormulaBoost=1, rewardShare=50.0000%, docsFormulaShare=50.0000%

## equal-position-no-kite / lpStaking

- 0xalice: boost=1, docsFormulaBoost=1, rewardShare=50.0000%, docsFormulaShare=50.0000%
- 0xbob: boost=1, docsFormulaBoost=1, rewardShare=50.0000%, docsFormulaShare=50.0000%

## equal-position-no-kite / lp

- 0xalice: boost=1, docsFormulaBoost=1, rewardShare=50.0000%, docsFormulaShare=50.0000%
- 0xbob: boost=1, docsFormulaBoost=1, rewardShare=50.0000%, docsFormulaShare=50.0000%

## overstaked-small-position / haiAERO

- 0xalice: boost=2, docsFormulaBoost=2, rewardShare=12.5000%, docsFormulaShare=12.5000%
- 0xbob: boost=1.5555555556, docsFormulaBoost=1.5555555556, rewardShare=87.5000%, docsFormulaShare=87.5000%

## overstaked-small-position / haiVELO

- 0xalice: boost=2, docsFormulaBoost=2, rewardShare=12.5000%, docsFormulaShare=12.5000%
- 0xbob: boost=1.5555555556, docsFormulaBoost=1.5555555556, rewardShare=87.5000%, docsFormulaShare=87.5000%

## overstaked-small-position / lpStaking

- 0xalice: boost=2, docsFormulaBoost=2, rewardShare=12.5000%, docsFormulaShare=12.5000%
- 0xbob: boost=1.5555555556, docsFormulaBoost=1.5555555556, rewardShare=87.5000%, docsFormulaShare=87.5000%

## kite-with-zero-position / haiAERO

- 0xalice: boost=1.4, docsFormulaBoost=1.4, rewardShare=41.1765%, docsFormulaShare=41.1765%
- 0xbob: boost=2, docsFormulaBoost=2, rewardShare=58.8235%, docsFormulaShare=58.8235%
- 0xcarol: boost=1, docsFormulaBoost=1, rewardShare=0.0000%, docsFormulaShare=0.0000%

## kite-with-zero-position / haiVELO

- 0xalice: boost=1.4, docsFormulaBoost=1.4, rewardShare=41.1765%, docsFormulaShare=41.1765%
- 0xbob: boost=2, docsFormulaBoost=2, rewardShare=58.8235%, docsFormulaShare=58.8235%
- 0xcarol: boost=1, docsFormulaBoost=1, rewardShare=0.0000%, docsFormulaShare=0.0000%

## kite-with-zero-position / lpStaking

- 0xalice: boost=1.4, docsFormulaBoost=1.4, rewardShare=41.1765%, docsFormulaShare=41.1765%
- 0xbob: boost=2, docsFormulaBoost=2, rewardShare=58.8235%, docsFormulaShare=58.8235%
- 0xcarol: boost=1, docsFormulaBoost=1, rewardShare=0.0000%, docsFormulaShare=0.0000%

## minter-kite-mismatch / minter

- 0xalice: boost=1.75, docsFormulaBoost=1, rewardShare=80.7692%, docsFormulaShare=60.0000%
- 0xbob: boost=1.25, docsFormulaBoost=2, rewardShare=19.2308%, docsFormulaShare=40.0000%

## lp-denominator-mismatch / lp

- 0xalice: boost=1.55, docsFormulaBoost=1.1, rewardShare=43.6620%, docsFormulaShare=35.4839%
- 0xbob: boost=2, docsFormulaBoost=2, rewardShare=56.3380%, docsFormulaShare=64.5161%

