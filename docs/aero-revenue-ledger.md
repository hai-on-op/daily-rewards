# Aero revenue ledger

This opt-in path replaces the haiVELO/haiAERO transfer-date reward inference with explicit earning intervals. It is disabled when `AERO_REWARDS_CONFIG_FILE` is absent. It does not infer activation from the calendar, token symbol, a receipt, or Aero's launch.

`CalculateRewardsStep` calls `combineResultsForDistribution`. When enabled, it loads a reviewed frozen cumulative snapshot of **only** the existing haiVELO/haiAERO strategies, adds the exact Aero ledger, combines the unrelated existing reward strategies, and applies the existing incident-adjusted claim accounting once. Existing minter and LP-staking governance windows are unchanged. Old product transfer scans are excluded. New reward amounts never pass through `number`, `parseEther`, or `toFixed`; the existing strategies retain their historical conversion behavior.

## Activation inputs

Create a configuration JSON outside production state, with this shape:

```json
{
  "enabled": true,
  "inputFile": "reviewed-input.json",
  "inputSha256": "<64 lowercase SHA256 characters of the exact input file>",
  "previousLedger": null,
  "rpcUrls": { "10": "https://mainnet.optimism.io", "8453": "https://mainnet.base.org" }
}
```

For all subsequent runs, `previousLedger` must be `{ "file": "previous-ledger.json", "sha256": "..." }`, pinned to the last accepted ledger. Do not restart with `null` to bypass historical consistency checks. The CLI output wraps its ledger under `ledger`; extract and pin that object, or use the standalone ledger saved by the orchestrator's Backup step. The configuration is never automatically updated.

The complete schema is `src/core/rewards/aero/types.ts`:

- `policy.cutover`: approved timestamp separating legacy and unified earning rules, not the day a transfer arrived.
- `policy.sources`: explicit eligible source identifiers, chains, contract addresses, eligible wrapper token addresses, asset denomination, and vault/LP kind. Vault sources must specify the reviewed collateral type when using the exporter. Configure the newly deployed HAI collateral identifier explicitly; the exporter never infers it from a token symbol. Use `eligibleFrom` and optionally `eligibleUntil` for reviewed source activation/retirement timestamps. The exporter splits intervals there and does not query a new collateral before its activation, allowing late legacy income to retain earlier history. No wallet balances or other treasury holdings are auto-enrolled.
- `policy.boost`: explicitly choose `none` with `maxBps: 10000`, or `skite-share` with `maxBps: 20000`. The latter applies `min(2*w, w + totalWeight*userSKite/totalSKite)` across the normalized eligible positions in each window.
- `policy.payoutTokens`: symbols, actual chain/address, and decimals. The production integration rejects bindings that differ from the current distributor's chain and token map. Base revenue therefore needs a verified funded payout on the distributor's chain; the ledger never pretends a Base receipt funds an Optimism distributor.
- `policy.collectors`: exact recipient and allowed transfer senders per chain. This must be the destination funding the selected distributor, not an unrelated treasury account.
- `baseline.cumulative`: frozen cumulative earned **before** claim subtraction and returned-overpayment adjustments. It must include all past haiVELO/haiAERO entitlements and exclude unrelated strategies still calculated normally.
- `baseline.coveredReceipts`: complete `chainId:transactionHash:logIndex` identities already included in that baseline. Historical fixed rewards without a funding receipt remain in cumulative amounts.
- `windows`: complete non-overlapping half-open `[start,end)` position intervals, with finalized block anchors that cover the end of each interval. Position owners, raw principal, sKITE, and LP reserves/supply are base-unit decimal strings. Every ownership, collateral, liquidation, staking, LP supply/reserve, and boost change must introduce a new interval. Omitted state cannot be recovered by the calculator.
- Vault position amounts are eligible wrapper principal. LP position amounts are the user's eligible staked LP units; `lp.eligibleReserve` is only the eligible hai-token reserve and `lp.totalSupply` is the contemporaneous LP supply. The paired token is not counted as wrapper principal.
- `batches`: exact funded ERC-20 receipt event, plus a reviewed source accounting reference and earning slices whose amounts sum exactly to that receipt. Use legacy regimes for late legacy income and `unified` for post-cutover income. Split any receipt covering both regimes into explicit slices. There is no guessed seven-day offset.

The input artifact is an explicit reviewed accounting boundary. RPC checks authenticate finality, canonical block hashes, token address/decimals, successful receipt, exact transfer log, recipient, allowed sender and amount. The calculator does not independently reconstruct position history or prove the accounting reference's earning interval. Use the exporter below to reconstruct and reconcile position history. Treasury Safe custody of the backing NFTs is unchanged; allowed treasury funding senders are explicit policy inputs. Source accounting still requires review of the earning intervals and revenue provenance, including any swap or bridge before distributor funding.

## Export historical positions

Run `yarn aero:export /path/export-config.json /path/new-export-directory`. The output directory must not exist. This read-only command emits `input.json`, its `input.sha256`, `evidence.json`, and a preview ledger after validating funded receipt evidence and accounting invariants. It reads no production environment configuration and creates no signer. Pin `input.json` in the activation configuration above; review and retain the evidence alongside it.

`ExportConfig` is defined in `src/core/rewards/aero/exporter.ts`. Supply:

- `policy`: the complete reviewed policy from the input schema, including cutoff, every eligible legacy/new collateral identifier, payout addresses and boost choice.
- `start` and `end`: complete half-open earning-history coverage required by all funded batches, including late legacy receipts.
- `chains`: chain ID to `{rpcUrl, fromBlock, toBlock, toBlockHash}`. Bounds must cover the time interval; the terminal canonical hash must be finalized.
- `vaults`: `{source, subgraphUrl, manager}` for each policy vault source. The policy source's `contract` is its SAFEEngine; `manager` is the corresponding SAFE manager. Each collateral type is explicit.
- `lpStaking`: `{source, chainId, contract, subgraphUrl, userEntity, pool}` for each eligible staked LP source. The policy `contract` must equal this staking manager, whose on-chain `protocolToken` must equal the configured pool. `pool` is the LP token, and the policy's `eligibleToken` must match one pool reserve token.
- `skite`: `{chainId, contract, subgraphUrl, userEntity}` for the sKITE manager, or `null` only when boost is explicitly disabled.
- `baseline` and `batches`: separate reviewed `{file, sha256}` inputs, paths relative to export configuration. Baseline is frozen cumulative earned before claim subtraction, not remaining claims and not all unrelated rewards. Each revenue receipt must identify its earning slices and provenance.
- Optional `logChunkSize` from 1 to 10000 (default 2000); smaller chunks can accommodate RPC limits.

Indexer pages use ordered ID cursors and the canonical **block hash** on every entity and `_meta` query. Missing/lagging metadata, indexing errors, duplicate rows, and exhausted pagination fail the export. The eligible wrapper must have deployed code and 18 decimals, and the collateral type must be initialized at every active snapshot. Each SAFE's raw principal and identity is verified against historical chain storage; graph ownership is checked against the manager and proxy owner. Aggregate SAFE principal must equal the collateral's SAFEEngine total. Every enumerated staking user's historical on-chain balance is used, and its sum must equal the manager's total stake. Historical LP reserves and total supply come from the same block. No floating-point or old strategy conversion helper is used.

The exporter scans chain logs for all relevant SAFE engines, managers, owner proxies, staking managers and pools. Every observed change block creates a new interval. Newly discovered proxies are scanned and intervals rebuilt until stable. This includes ownership transfers, collateral/liquidation changes, withdrawal initiation/cancellation, and LP supply/reserve changes. It fails when an indexer omits aggregate collateral or stake, when archive RPC history is unavailable, or when a configured source cannot be verified. A deployed and indexed new collateral is required before it can be included; missing deployment is not represented as zero principal.

This workflow trusts correctly functioning archive RPC and indexer services. It reconciles enumerated positions to chain storage but does not independently execute blocks or prove that an RPC has returned every log. The cutoff, eligible collateral/pool bindings, baseline provenance and actual revenue earning attribution remain review inputs.

## Calculation and replay

VELO principal is normalized with exact ratio `44/1000`; old AERO and new AERO use `1`. LP fractions and boosts retain rational precision until the final distribution. Within each earning slice, reward accrual is treated as uniform over its explicit duration; subdivide nonuniform accrual using the actual source accounting checkpoints. Rewards are integrated over changes in ownership/weight, then allocated by largest remainder with lexicographic address tie-breaking. Every funded base unit is allocated. A positive batch with no eligible weight fails instead of silently disappearing.

A receipt can appear once. Baseline-covered receipts, duplicate receipts, changed historical inputs, removed previously allocated receipts, overlapping slices of the same regime within a receipt, missing interval history, mismatched slice totals, unknown sources and unfinalized/reorged evidence fail the run. Replaying the same full input produces the same cumulative ledger. New receipts append to that full history; they are not incremental balance mutations. Existing allocations and legacy cumulative amounts are not reset by claims or retries. Extending later history, refreshing finalized anchors, or splitting an unchanged interval leaves prior receipt fingerprints unchanged; changing any economic history used by an accepted receipt fails.

## Read-only dry run

```sh
yarn aero:dry-run --config /path/aero-config.json \
  --output /path/new-review-result.json \
  --claims-subgraph https://your-current-distributor-subgraph \
  --claim-adjustments /path/current-returned-overpayment-adjustments.json
```

This command reads finalized chain evidence and the existing effective-claim service, and writes a new review artifact containing the cumulative ledger, remaining claim-adjusted distribution input and Merkle trees. It refuses to overwrite an existing file and never creates a signer, submits a transaction, uploads results or changes production configuration. Include the current incident adjustment file when applicable. It calculates only this product ledger; the production orchestrator additionally includes the other existing strategies.

After review, point the orchestrator at the same pinned config through `AERO_REWARDS_CONFIG_FILE`. Its existing publication gates remain in effect. Backup writes the ledger alongside Merkle artifacts before publication. Legacy floating-point detailed reporting deliberately fails when this feature is enabled; use the exact ledger artifact until the report viewer supports exact amounts.

## Verification

Focused tests cover exact indexer decimals and pagination, missing aggregate collateral, chain-log ownership intervals, principal normalization, historical LP fractions, unified boosts, changing ownership, values beyond JavaScript integer precision, deterministic rounding/conservation, late pre-cutover income, duplicate/replayed/changed receipts, finalized transfer proofs, existing claim adjustments and exact Merkle inputs. Production remains disabled until the baseline, source history, revenue accounting and payout funding are reconciled and pinned.
