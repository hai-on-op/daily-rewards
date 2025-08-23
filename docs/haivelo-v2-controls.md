## HaiVELO v2 controls: reward split and boost

### Overview
- **Goal**: Treat HaiVELO v1 and v2 together while giving ops-level control over how much of the reward and boost goes to each version.
- **What changed**: We added v1/v2 subgraph inputs, per-version reward split, per-version boost bias/cap, and a choice of boost denominator mode (combined or perVersion).

### Key behaviors
- Rewards are computed per version and then combined:
  - The total reward amount for a period is split into `v1` and `v2` portions.
  - Each portion runs through the HaiVELO processor, with its own boost shaping.
  - Final results are merged by address and fed into the existing combiner.
- Boost is SKITE-share-based, with optional per-version bias and cap.
- Boost denominator mode:
  - `combined`: compare each user’s stake against the total combined collateral across v1+v2.
  - `perVersion`: compare against each version’s own collateral only.

### Configuration
All values are read via `src/config/index.ts` and backed by environment variables.

- Subgraphs and collateral IDs
  - `HAIVELO_V1_SUBGRAPH_URL` (default: `HAIVELO_SUBGRAPH_URL`)
  - `HAIVELO_V2_SUBGRAPH_URL` (default: `HAIVELO_SUBGRAPH_URL`)
  - `HAIVELO_V1_COLLATERAL_ID` (default: `HAIVELO`)
  - `HAIVELO_V2_COLLATERAL_ID` (default: `HAIVELO_V2`)

- Optional per-version block bounds
  - `HAIVELO_V1_START_BLOCK`, `HAIVELO_V1_END_BLOCK`
  - `HAIVELO_V2_START_BLOCK`, `HAIVELO_V2_END_BLOCK`

- Reward split
  - `HAIVELO_REWARD_SPLIT` JSON (default: `{ "default": { "v1": 1, "v2": 0 } }`)
  - `HAIVELO_REWARD_SPLIT_SCHEDULE` JSON array of windows:
    - `[ { "fromBlock": 123, "toBlock": 456, "v1": 0.5, "v2": 0.5 }, ... ]`
  - Notes:
    - Daily (transfer-based) runs look up the active schedule by period.
    - Historical single-range runs use the default split unless you segment runs by schedule windows.

- Boost controls
  - `HAIVELO_BOOST_CONFIG` JSON (default: `{ v1: { bias: 1, cap: 2 }, v2: { bias: 1, cap: 2 } }`)
    - `bias`: scales only the extra over 1x, i.e. `final = 1 + bias * (raw - 1)`
    - `cap`: upper bound applied after biasing
  - `HAIVELO_BOOST_DENOMINATOR_MODE` (default: `perVersion`) – `combined` or `perVersion`

### Examples
1) Send 25% of rewards to v1, 75% to v2, with v2-favored boost
```
HAIVELO_REWARD_SPLIT={"default":{"v1":0.25,"v2":0.75}}
HAIVELO_BOOST_CONFIG={"v1":{"bias":0.9,"cap":1.9},"v2":{"bias":1.2,"cap":2.0}}
HAIVELO_BOOST_DENOMINATOR_MODE=combined
```

2) Time-based schedule from a given block
```
HAIVELO_REWARD_SPLIT_SCHEDULE=[
  {"fromBlock":120000000,"toBlock":129999999,"v1":0.50,"v2":0.50},
  {"fromBlock":130000000,"toBlock":999999999,"v1":0.25,"v2":0.75}
]
```

### Historical vs daily runs
- Historical calculation (pre-deposits):
  - Uses `config().rewards.haiVelo.historicConfig` for token amounts.
  - By default, a single range uses the default split. For exactness across split schedule changes, run multiple ranges aligned to schedule windows.
- Daily (transfer-triggered) calculation:
  - Each period is derived from deposits; the active split for that period is applied inside the HaiVELO module.

### Minter rewards for HAIVELO vaults (v1 and v2)
- Minter rewards operate per collateral type (`cType`) from the GEB subgraph.
- The minter processor now fetches accumulated rates dynamically for the collateral types present in the event stream, so adding `HAIVELO_V2` (or any new HAIVELO vault id) is automatically supported as long as events carry that `cType`.
- To allocate minter rewards to HAIVELO vaults, include the corresponding `cType` keys (e.g., `HAIVELO`, `HAIVELO_V2`) in the minter reward config. No additional wiring is required.

### Defaults and backward compatibility
- With no new envs set:
  - 100% of rewards go to v1, boost is unbiased and capped at 2x, and boost denominator is `perVersion` (equivalent to previous behavior for v1-only).

### Troubleshooting
- Zero v2 output: verify `HAIVELO_V2_SUBGRAPH_URL` and `HAIVELO_V2_COLLATERAL_ID`.
- Over-capped boosts: reduce `cap` or set `bias` closer to `1`.
- Performance: if subgraphs are large, ensure endpoints support pagination and consider network-level caching.

### Implementation notes
- Code entry points
  - `src/modules/haivelo-rewards.ts`: orchestrates split, per-version processing, and merges results.
  - `src/services/rewards/haiVeloRewardEventProcessor.ts`: applies bias/cap and denominator mode.
  - `src/services/initial-data/getInitialHaiveloState.ts`: fetches v1/v2 subgraphs, provides unified and per-version event streams.


