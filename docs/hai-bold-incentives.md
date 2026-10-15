# HAI/BOLD liquidity incentive increase

The [approved proposal](https://www.tally.xyz/gov/hai/proposal/85744590750752743064197155308552775228575410502356986056978378831005573100938) increases campaign `lp-hai-bold-curve` (`HAI_BOLD_CURVE`) from 25 to 50 KITE/day. This applies only to Curve LP staking; borrowing incentives and collateral parameters are unchanged.

## Effective reward period

Governance [execution](https://optimistic.etherscan.io/tx/0xb022222c5b3427a1eb86c195f57d7fbb36a40c089f3f03acb72bfdeae665c5d4) succeeded in Optimism block **158074992**, timestamp **2026-10-11 19:59:21 UTC**. The distributor and daily reports use midnight UTC day boundaries. The first full daily period after execution therefore starts on **2026-10-12 at 00:00 UTC**; the 18:00 distribution timer is a processing schedule, not a reward-day boundary.

The first block in that day is **158082212**, timestamp **2026-10-12 00:00:01 UTC**. The preceding block, **158082211**, is at **2026-10-11 23:59:59 UTC**. RPC receipt and block reads verified these values. The schedule uses the first block after midnight, a one-second alignment difference.

## Published configuration

[config/lp-staking-windows.json](../config/lp-staking-windows.json) contains the complete LP staking schedule. [env.example](../env.example) contains the same schedule as a single-line `REWARD_LP_STAKING_WINDOWS` value. Runtime configuration still comes from that environment variable; the JSON file is the published reference, not an automatically loaded override.

| Campaign | Start block | End boundary | KITE/day |
| --- | ---: | ---: | ---: |
| HAI/BOLD Curve | 144937170 | 146037861 | 25 |
| HAI/BOLD Curve | 146037862 | 158082212 | 25 |
| haiVELO-VELO | 146037862 | Ongoing | 25 |
| HAI/BOLD Curve | 158082212 | Ongoing | 50 |

Rewards accrue over elapsed time: `dailyRate * (endBlock - startBlock) / 43200`. The old HAI/BOLD window ends at the same block where the new window starts, so the transition neither loses nor duplicates a block interval. The earlier historical boundary is retained exactly as configured. haiVELO-VELO keeps its original uninterrupted window and 25 KITE/day rate.

Historical earnings remain at 25 KITE/day. Cumulative recalculation adds the increased entitlement only from the activation boundary; claim accounting is unchanged. Calculations and daily reports cap each window at the requested end block (or current chain head) and skip windows that have not begun.

## Operator rollout and confirmation

Replace only `REWARD_LP_STAKING_WINDOWS` in the operator's `.env` with the value from `env.example`. To print the value from the published JSON:

```sh
node -e 'console.log("REWARD_LP_STAKING_WINDOWS=" + JSON.stringify(require("./config/lp-staking-windows.json")))'
```

The local operator `.env` was updated on **2026-10-15**, later than the required effective reward day. The effective block remains **158082212** so the next cumulative calculation includes the additional entitlement from October 12; no earlier earnings are repriced. This documents the configuration delay, not confirmation of an on-chain reward update.

Before publishing implementation confirmation, build the deployed code with `yarn build`, run the normal reward distribution workflow, and verify its published KITE root and report. Record the first successful distribution timestamp, covered end block, and transaction hash, and disclose the delay from October 12. At the time of this repository change, no distribution or public confirmation was performed.
