import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { providers } from 'ethers';
import { calculateAeroLedger } from './ledger';
import { RpcEvidenceVerifier } from './evidence';
import { AeroFileConfig, AeroInput, AeroLedger } from './types';
export async function readPinnedJson<T>(filename: string, sha256: string): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Reviewed artifact SHA-256 required');
  const contents = await fs.readFile(filename);
  if (createHash('sha256').update(contents).digest('hex') !== sha256) throw new Error('Reviewed artifact digest mismatch');
  return JSON.parse(contents.toString('utf8'));
}
export async function loadAeroRun(configFile: string): Promise<{ input: AeroInput; ledger: AeroLedger }> {
  const config: AeroFileConfig = JSON.parse(await fs.readFile(configFile, 'utf8'));
  if (config.enabled !== true || !config.rpcUrls || !Object.prototype.hasOwnProperty.call(config, 'previousLedger')) throw new Error('Aero configuration is incomplete');
  const resolve = (f: string) => path.resolve(path.dirname(configFile), f);
  const input = await readPinnedJson<AeroInput>(resolve(config.inputFile), config.inputSha256);
  if (input.previous !== undefined) throw new Error('Prior ledger must be separately pinned');
  if (config.previousLedger !== null) input.previous = await readPinnedJson<AeroLedger>(resolve(config.previousLedger.file), config.previousLedger.sha256);
  const clients: Record<string, providers.Provider> = {};
  for (const [chain, url] of Object.entries(config.rpcUrls)) {
    if (!/^https?:\/\//.test(url)) throw new Error('Invalid RPC URL');
    clients[chain] = new providers.StaticJsonRpcProvider(url);
  }
  return { input, ledger: await calculateAeroLedger(input, new RpcEvidenceVerifier(clients)) };
}
