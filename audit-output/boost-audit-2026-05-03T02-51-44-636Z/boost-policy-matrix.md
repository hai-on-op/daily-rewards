# Boost Policy Matrix

Generated at: 2026-05-03T02:51:44.636Z

This matrix is extracted from the current implementation. It is not an approval of the policy.

| Strategy | Position metric | Implemented formula | Uses stKITE | Denominator | Audit question |
|---|---|---|---|---|---|
| haiAERO | haiAERO collateral | min(kiteShare / collateralShare + 1, 2) | yes | sum of active haiAERO collateral | Confirm haiAERO boost should be based on collateral share and stKITE share. |
| haiVELO | haiVELO collateral + staked LP converted to haiVELO-equivalent | min(kiteShare / haiVeloWeightShare + 1, 2) | yes | sum of active haiVELO-equivalent weight | Confirm LP-to-haiVELO conversion and stKITE share should be combined this way. |
| lpStaking | staked LP token amount | min(kiteShare / lpStakeShare + 1, 2) | yes | sum of active LP staking balance for that staking type | Confirm each LP staking pool should have an independent boost denominator. |
| lp | full-range Uniswap V3 LP liquidity | min(kiteShare / (fullRangeLiquidity / allLiquidity) + 1, 2) | yes | all LP position liquidity, including non-full-range positions | Confirm the boost denominator should include non-full-range liquidity even though rewards use only full-range liquidity. |
| minter | SAFE debt | min(debtShare + 1, 2) | no | sum of active debt for the collateral type | Confirm whether minter boost should ignore stKITE. This differs from the repo docs' general KITE boost formula. |
