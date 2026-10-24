import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { exportAeroInput, ExportConfig } from '../core/rewards/aero/exporter';
import { readPinnedJson } from '../core/rewards/aero/files';
import { LegacySnapshot, RevenueBatch } from '../core/rewards/aero/types';
import { providers } from 'ethers';
import { calculateAeroLedger } from '../core/rewards/aero/ledger';
import { RpcEvidenceVerifier } from '../core/rewards/aero/evidence';
export async function main(args = process.argv.slice(2)): Promise<void> {
  const configFile = args[0], output = args[1];
  if (!configFile || !output || args.length !== 2) throw new Error('Usage: aero:export EXPORT_CONFIG NEW_OUTPUT_DIRECTORY');
  const config: ExportConfig = JSON.parse(await fs.readFile(configFile, 'utf8'));
  const resolve = (f: string) => path.resolve(path.dirname(configFile), f);
  const baseline = await readPinnedJson<LegacySnapshot>(resolve(config.baseline.file), config.baseline.sha256);
  const batches = await readPinnedJson<RevenueBatch[]>(resolve(config.batches.file), config.batches.sha256);
  const result = await exportAeroInput(config, baseline, batches);
  const clients = Object.fromEntries(Object.entries(config.chains).map(([id, c]) => [id, new providers.StaticJsonRpcProvider(c.rpcUrl)]));
  // Validate the complete accounting and authenticated funding before producing a usable input.
  const ledger = await calculateAeroLedger(result.input, new RpcEvidenceVerifier(clients));
  const input = JSON.stringify(result.input, null, 2), sha256 = createHash('sha256').update(input).digest('hex');
  await fs.mkdir(output); // Never overwrite a prior export or a production ledger.
  await fs.writeFile(path.join(output, 'input.json'), input, { flag: 'wx' });
  await fs.writeFile(path.join(output, 'evidence.json'), JSON.stringify(result.evidence, null, 2), { flag: 'wx' });
  await fs.writeFile(path.join(output, 'input.sha256'), sha256 + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(output, 'preview-ledger.json'), JSON.stringify(ledger, null, 2), { flag: 'wx' });
  console.log(`Exported ${result.input.windows.length} verified intervals; input SHA256 ${sha256}`);
}
if (require.main === module) main().catch((error) => { console.error('Aero export stopped without activation; inspect reviewed configuration, indexer coverage, RPC history and funding evidence.'); process.exitCode = 1; });
