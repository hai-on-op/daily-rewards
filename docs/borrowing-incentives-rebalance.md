# Borrowing incentive and fee rebalance

The [approved proposal](https://www.tally.xyz/gov/hai/proposal/48855936318323678441355747197311659475249006304034216643961738301671004651929) changes three borrowing campaign budgets:

| Collateral | Previous KITE/day | New KITE/day | Annualized stability fee |
| --- | ---: | ---: | --- |
| `YV-VELO-MSETH-WETH` | 25 | 10 | 2.5% → 5% |
| `MOO-VELO-BOLD-LUSD` | 25 | 10 | 2.5% → 5% |
| `MSETH` | 25 | 0 | Remains 2% |

The combined budget for these three campaigns drops from 75 to 20 KITE/day. These are total campaign budgets, allocated among eligible borrowers by the existing reward calculation.

## On-chain execution

The governance [execution transaction](https://optimistic.etherscan.io/tx/0xab7fa0338f510f62df6c4feccddcb64ab960c2a6ab17b6f657e86809930b4809) succeeded in Optimism block **158074935**, timestamp **2026-10-11 19:57:27 UTC**. The payload updates both LP collateral fee factors and calls `taxSingle` for each. These fee changes were already executed by governance; this repository update sends no fee-changing transactions.

Read-only RPC verification on October 15 confirmed successful execution and these current `cParams` fee factors on tax collector `0x62B82ccE08f8F2D808348409E9418c65EB1973C3`:

- Both LP collaterals: `1000000001547125957863212448` (5% annualized).
- `MSETH`: `1000000000627937192491029810` (2% annualized).

## Prospective activation and disclosed delay

The proposal targeted the first full UTC reward day following execution, **October 12, 2026**. The operator's configuration still awarded the previous rates, and verified distributions continued through October 14. The last verified run inspected was `2026-10-14T18-00-06-650Z-3427999`, with minter cutoff **158200987** and [root-update transaction](https://optimistic.etherscan.io/tx/0x7c3b48000e938bf8ac06ad2c1f07738b56a82422b922db7f33ab10557908bac7). Claims were subsequently unpaused.

Applying the cuts retroactively to October 12 would lower already published entitlements. The operator therefore selected **October 16, 2026 at 00:00 UTC** as the prospective activation day, preserving rewards accrued before that boundary. This is a **four-day delay** from the proposal's intended reward start, explicitly disclosed here.

The configured boundary is **158255012**, projected at **2026-10-16 00:00:01 UTC** using Optimism's two-second block cadence. It is the first block after midnight, with a one-second alignment difference. This was derived from observed block **158218868** at **2026-10-15 03:55:13 UTC**; the activation block had not yet been mined when configured.

## Published schedule and entitlement preservation

[config/minter-windows.json](../config/minter-windows.json) is the complete published schedule. [env.example](../env.example) supplies its single-line `REWARD_MINTER_WINDOWS` equivalent. Runtime configuration continues to use the environment variable; the JSON file is the published reference.

All completed historical windows remain intact. The previously open window beginning at **154658587** is separated by campaign: the three affected campaigns keep their old rates until **158255012**, while other campaigns retain their original uninterrupted window. A new window begins at **158255012** with rates 0/10/10 for msETH/Yearn msETH-WETH/Beefy BOLD-LUSD respectively. Historical msETH rewards remain claimable even though its new allocation is zero.

Reward windows account for elapsed intervals using `endBlock - startBlock`; sharing the transition endpoint avoids losing or duplicating an interval. Calculations and daily reports cap all windows at the requested cutoff or current chain head and skip future or empty windows. This prevents a run before October 16 from querying future blocks or prematurely accruing the old window through its configured end.

HAIVELOV2 and HAIAERO borrowing budgets remain 50 KITE/day each. Other borrowing campaign histories and the separately configured HAI/BOLD Curve LP staking increase are unchanged. Claim subtraction and approved claim adjustments are unchanged.

This update retains the existing boost calculation. The known boost-timing issues in [the boost audit](boost-audit-handoff.md) can cause allocated user totals to differ from the nominal campaign budget when positions change; resolving those issues requires a separate historical impact review. Regression checks here verify the configured budgets with stable positions and accrued-entitlement preservation at a repayment boundary.

## Operator rollout and public confirmation

The local `.env` was updated on **October 15, 2026** to schedule the October 16 activation. To print the deployment value from the published schedule:

```sh
node -e 'console.log("REWARD_MINTER_WINDOWS=" + JSON.stringify(require("./config/minter-windows.json")))'
```

Build the deployed code with `yarn build` before using this schedule: the minter cutoff fix is required while the activation block is still in the future. The next scheduled distribution before activation continues using the old rates; subsequent runs retain those earnings and apply the reduced rates only after the boundary.

After the first successful distribution covering the activation boundary, verify the KITE root, campaign totals, and activation block timestamp. Publish confirmation with the distribution transaction hash, covered end block, the actual October 16 reward start, and the four-day delay. This repository change records configuration preparation; it does not claim a post-activation distribution or public confirmation has occurred.
