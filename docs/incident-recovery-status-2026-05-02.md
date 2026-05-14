# Daily Rewards Incident Recovery Status

Snapshot based on the VPS `/ops/status` output from `2026-05-02T21:05:49.947Z`.

## Current State

- Branch deployed: `feat/reward-analytics-claim-fix`
- Deployed commit shown by the run manifest: `7e9115c9c7ef01dccbd46ee39a58b4c9b67fbf94`
- Reward distributor: `0xfEd2eB6325432F0bF7110DcE2CCC5fF811ac3D4D`
- Contract state: unpaused
- Current `epochCounter`: `316`
- Current automation timers:
  - `entry-task.timer`: next run `2026-05-03T18:00:00Z`
  - `unpause-task.timer`: next run `2026-05-03T20:00:00Z`

Current roots on-chain:

```text
OP:   0x137f2bfdf6c4db91d05c1c4720b268879fca059518c7336999072d32920788e4
HAI:  0x514ef53f79e374f46e13911e1697347fdfca29c3a1469a267a12a52ed9661e14
KITE: 0x5459d6e549292437fc6d9f55ce2c0770c98a02750845afedc5cdf186872a9c6a
```

Latest root-update transaction:

```text
0x3feec44b03dc1df09d05b67c809f59260c48c754eb2969ebd6519a2d8b89f34c
```

Latest unpause transaction:

```text
0xf1ed740e393d37a720fb13596e92de58aa7ca360f971cf0d3d7d33eec22e5005
```

## What We Accomplished

- Fixed the claim-accounting bug that missed previous claims because distributor subgraph `tokenClaims` was not paginated.
- Added returned-overpayment accounting through `CLAIM_ADJUSTMENTS_FILE`.
- Confirmed returned KITE adjustments for:
  - `0xf4527a233f669a55922f707c61054fa78bea7402`
  - `0xf23f999ece302ea646509b51e6c4c19055471ab0`
- Left the unresolved `288.168162112565880761` KITE overclaim for `0xfe2f55dcefb42b018ed7f2b44d8cb8158733f5fe` uncredited.
- Updated roots successfully and unpaused the contract.
- Added automation manifests in `ops-state/`.
- Added guarded unpause logic so unpause refuses to run unless:
  - latest root-update manifest is verified
  - contract is paused
  - epoch counter matches the manifest
  - on-chain roots match the manifest
  - backup files exist and match the roots
  - Cloudflare uploads succeeded
- Reworked systemd automation to run built JS directly with a shared `flock` lock.
- Removed PM2 from the critical reward-update and unpause path.
- Kept PM2 only for the long-running `report-api`.
- Added `GET /ops/status` for operational state.

## Verified Outputs

The latest manifest says:

```text
lastRootUpdate.status = verified
lastRootUpdate.verification.ok = true
contract.paused = false
contract.epochCounter = 316
errors = []
```

For OP, HAI, and KITE:

```text
backupVerified = true
cloudflareUploaded = true
onChainVerified = true
```

So Cloudflare was updated for all three Merkle trees.

## How To Check Health

From the VPS:

```bash
curl -s http://127.0.0.1:3100/ops/status | python3 -m json.tool
```

Healthy after unpause should look like:

```text
status = ok
contract.paused = false
lastRootUpdate.status = verified
lastRootUpdate.verification.ok = true
lastUnpause is not null
errors = []
```

`lastRootUpdate.safeToUnpause = false` is expected after unpause because the contract is already unpaused.

## Remaining Work

Nothing is blocking operations right now. The system is live again.

Recommended follow-ups:

- Monitor the next scheduled run on `2026-05-03`:
  - root update at `18:00 UTC`
  - guarded unpause at `20:00 UTC`
- After tomorrow's run, check `/ops/status` and confirm:
  - `lastRootUpdate.status = verified`
  - `lastRootUpdate.verification.ok = true`
  - `lastUnpause` updates after the unpause timer
  - `errors = []`
- If remote access is needed, keep `report-api` bound to `127.0.0.1` and expose it through Tailscale Serve:

```bash
sudo tailscale serve --bg --http=3100 localhost:3100
tailscale serve status
```
- Consider renaming or supplementing `safeToUnpause` with a clearer field like `unpauseReady`; it correctly becomes `false` after the contract is already unpaused, but that can be confusing.
- If `0xfe2f55dcefb42b018ed7f2b44d8cb8158733f5fe` returns the unresolved `288.168162112565880761` KITE later, add a new adjustment entry with the return transaction and rerun the normal verification flow.

## Useful Logs

```bash
sudo tail -n 200 /var/log/entry-task.log
sudo tail -n 200 /var/log/unpause-task.log
pm2 logs report-api
systemctl list-timers entry-task.timer unpause-task.timer
```
