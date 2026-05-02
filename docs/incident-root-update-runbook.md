# Incident Root Update and Unpause Runbook

This runbook is for the KITE overclaim incident recovery. The safety rule is:

**Update roots first, verify while paused, then unpause.**

Do not unpause the reward distributor until the fixed merkle roots are on-chain and the uploaded/backed-up merkle trees match those roots.

## Context

- Reward distributor: `0xfEd2eB6325432F0bF7110DcE2CCC5fF811ac3D4D`
- Expected pre-update state for this incident:
  - `paused: true`
  - `epochCounter: 314`
  - `rootSetter: 0x2abCD4aE046335A0Af2647E0287C3675878662Cf`
- The root update should increment `epochCounter` from `314` to `315`.
- `unpause()` should not change `epochCounter`, `epochDuration`, `bufferDuration`, or `startTimestamp`.
- `updateMerkleRoots()` checks the epoch/buffer gate and increments `epochCounter`.

## 1. Freeze Automation

On the production box, stop both timers so nothing races the recovery run:

```bash
sudo systemctl stop entry-task.timer unpause-task.timer
sudo systemctl status entry-task.timer unpause-task.timer
```

Do not run the unpause task yet.

## 2. Set the Adjustment File

Use the production environment, plus the incident adjustment file:

```bash
export CLAIM_ADJUSTMENTS_FILE=/Users/piesrtasty/development/luke-dev/hai/incident-audit/claim-adjustments.json
```

Confirm the file includes only returned overpayments:

- `0xf4527a233f669a55922f707c61054fa78bea7402`: returned `2316.707953996023206855` KITE
- `0xf23f999ece302ea646509b51e6c4c19055471ab0`: returned `2792.111596213107077347` KITE

Do not credit the unresolved `288.168162112565880761` KITE overclaim unless that wallet returns funds.

## 3. Preflight

Run:

```bash
yarn build
yarn test --runInBand
```

Then confirm live contract state:

```bash
node - <<'NODE'
require("dotenv").config();
const { ethers } = require("ethers");

const abi = [
  "function paused() view returns (bool)",
  "function epochCounter() view returns (uint256)",
  "function epochDuration() view returns (uint256)",
  "function bufferDuration() view returns (uint256)",
  "function startTimestamp() view returns (uint256)",
  "function rootSetter() view returns (address)"
];

(async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.DISTRIBUTOR_RPC_URL || process.env.RPC_URL
  );
  const c = new ethers.Contract(process.env.REWARD_DISTRIBUTOR_ADDRESS, abi, provider);
  console.log({
    paused: await c.paused(),
    epochCounter: String(await c.epochCounter()),
    epochDuration: String(await c.epochDuration()),
    bufferDuration: String(await c.bufferDuration()),
    startTimestamp: String(await c.startTimestamp()),
    rootSetter: await c.rootSetter(),
    signer: new ethers.Wallet(process.env.REWARD_SETTER_PRIVATE_KEY).address,
  });
})();
NODE
```

Expected before update:

```text
paused: true
epochCounter: 314
signer == rootSetter
```

Stop if `paused` is false or if `signer` does not match `rootSetter`.

## 4. Final Dry Run

Run one last dry-run:

```bash
CLAIM_ADJUSTMENTS_FILE="$CLAIM_ADJUSTMENTS_FILE" yarn entry:dry-run
```

Confirm it reaches:

```text
CalculateRewards completed
GenerateMerkleTrees completed
UpdateOnChain skipped
```

Dry-run roots may differ from prior dry-runs because blocks keep advancing. That is expected.

## 5. Update Roots While Still Paused

Run the production entry task. This updates roots but does not unpause the contract.

```bash
CLAIM_ADJUSTMENTS_FILE="$CLAIM_ADJUSTMENTS_FILE" FEATURE_MODE=production yarn entry:prod
```

Watch for:

```text
UpdateOnChain completed
Backup completed
CloudUpload completed
Process completed successfully
```

If Cloudflare upload fails but the on-chain update succeeds, leave the contract paused and fix/upload the merkle trees before unpausing.

## 6. Post-Update Verification

Immediately check state again:

```bash
node - <<'NODE'
require("dotenv").config();
const { ethers } = require("ethers");

const abi = [
  "function paused() view returns (bool)",
  "function epochCounter() view returns (uint256)",
  "function merkleRoots(address) view returns (bytes32)"
];

(async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.DISTRIBUTOR_RPC_URL || process.env.RPC_URL
  );
  const c = new ethers.Contract(process.env.REWARD_DISTRIBUTOR_ADDRESS, abi, provider);

  console.log({
    paused: await c.paused(),
    epochCounter: String(await c.epochCounter()),
    OP: await c.merkleRoots(process.env.OP_ADDRESS),
    HAI: await c.merkleRoots(process.env.HAI_ADDRESS),
    KITE: await c.merkleRoots(process.env.KITE_ADDRESS),
  });
})();
NODE
```

Expected after root update:

```text
paused: true
epochCounter: 315
roots match the roots printed by the production run
```

The contract emits/uses epoch `314` for the root update, then increments `epochCounter` to `315`. That is expected.

## 7. Verify Backups

Check the latest backup files:

```bash
ls -lt merkle-backups | head
```

Confirm the OP, HAI, and KITE backup roots match the on-chain roots from the post-update verification.

## 8. Only Then Unpause

Once roots, backups, and upload are confirmed:

```bash
node_modules/.bin/ts-node src/modules/unpause.ts
```

Then verify:

```bash
node - <<'NODE'
require("dotenv").config();
const { ethers } = require("ethers");

(async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.DISTRIBUTOR_RPC_URL || process.env.RPC_URL
  );
  const c = new ethers.Contract(
    process.env.REWARD_DISTRIBUTOR_ADDRESS,
    [
      "function paused() view returns (bool)",
      "function epochCounter() view returns (uint256)"
    ],
    provider
  );
  console.log({
    paused: await c.paused(),
    epochCounter: String(await c.epochCounter()),
  });
})();
NODE
```

Expected:

```text
paused: false
epochCounter: 315
```

## 9. Re-enable Automation

After everything is verified:

```bash
sudo systemctl start entry-task.timer unpause-task.timer
sudo systemctl status entry-task.timer unpause-task.timer
```

## Failure Handling

- If the root update fails, keep the contract paused and inspect the error before retrying.
- If the root update succeeds but backup or Cloudflare upload fails, keep the contract paused until the merkle tree files users need are available.
- If post-update roots do not match the generated roots, do not unpause.
- If `epochCounter` does not move from `314` to `315` after a successful root update, do not unpause.
- If the unresolved `288.168162112565880761` KITE wallet returns funds later, add a new adjustment entry with its return transaction and rerun the normal verification flow.
