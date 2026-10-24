import fs from 'fs/promises';
import { BigNumber } from 'ethers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { loadAeroRun } from '../core/rewards/aero/files';
import { getEffectiveClaimedAmounts, subtractClaimedRewards } from '../services/claim-accounting';
import { ExactRewards } from '../core/rewards/aero/types';
/** Explicit read-only runner: no signer, upload, root publication or production ledger mutation. */
export async function main(args = process.argv.slice(2)): Promise<void> {
  const value = (flag: string): string | undefined => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
  const configFile = value('--config'), output = value('--output'), subgraph = value('--claims-subgraph');
  if (!configFile || !output || !subgraph) throw new Error('Usage: aero:dry-run --config FILE --output NEW_FILE --claims-subgraph URL [--claim-adjustments FILE]');
  const { input, ledger } = await loadAeroRun(configFile);
  const tokenAddressMap = Object.fromEntries(Object.entries(input.policy.payoutTokens).map(([symbol, token]) => [symbol, token.address]));
  const finalRewards: ExactRewards = {}, trees: Record<string, unknown> = {};
  for (const [token, rewards] of Object.entries(ledger.cumulative)) {
    const claimed = await getEffectiveClaimedAmounts(tokenAddressMap[token], rewards.map(r => r.address), {
      distributorSubgraphUrl: subgraph, claimAdjustmentsFile: value('--claim-adjustments'), tokenAddressMap,
    });
    finalRewards[token] = subtractClaimedRewards(rewards, claimed, BigNumber.from(0));
    if (finalRewards[token].length) trees[token] = StandardMerkleTree.of(finalRewards[token].map(r => [r.address, r.earned]), ['address', 'uint256']).dump();
  }
  await fs.writeFile(output, JSON.stringify({ kind: 'aero-revenue-dry-run', ledger, finalRewards, trees }, null, 2), { flag: 'wx' });
  console.log(`Wrote verified Aero revenue calculation and distribution input to ${output}`);
}
if (require.main === module) main().catch(() => { console.error('Aero dry-run failed; no artifact published. Check configuration, reviewed input, RPC finality and claim accounting.'); process.exitCode = 1; });
