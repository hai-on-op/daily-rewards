import axios from 'axios';
import { Contract, providers, utils } from 'ethers';
import { AeroInput, AeroPolicy, Anchor, LegacySnapshot, Position, RevenueBatch } from './types';
import { address, amount, integer, hash32, digest } from './ledger';
import { RpcEvidenceVerifier } from './evidence';
export interface ExportChain { rpcUrl: string; fromBlock: number; toBlock: number; toBlockHash: string }
export interface VaultExportSource { source: string; subgraphUrl: string; manager: string }
export interface StakingExportSource { source?: string; chainId: number; contract: string; subgraphUrl: string; userEntity: string; pool?: string }
export interface ExportConfig {
  policy: AeroPolicy;
  start: number;
  end: number;
  chains: Record<string, ExportChain>;
  vaults: VaultExportSource[];
  lpStaking: StakingExportSource[];
  skite: StakingExportSource | null;
  baseline: { file: string; sha256: string };
  batches: { file: string; sha256: string };
  logChunkSize?: number;
}
async function parallelRows<T>(rows: T[], run: (row: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, rows.length) }, async () => {
    while (next < rows.length) { const row = rows[next++]; await run(row); }
  }));
}
type Query = (url: string, query: string) => Promise<any>;
export const graphQuery: Query = async (url, query) => {
  try {
    const r = await axios.post(url, { query }, { timeout: 30000 });
    if (r.data.errors?.length || !r.data.data) throw new Error('GraphQL errors or missing data');
    return r.data.data;
  } catch { throw new Error('Required indexer query failed; refusing partial history'); }
};
/** Stable ID cursor, block pin and metadata checks on EVERY page; no silent empty/error fallback. */
export async function pinnedRows(url: string, field: string, fields: string, where: string, anchor: Anchor,
  query: Query = graphQuery, maxPages = 10000): Promise<any[]> {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(field)) throw new Error('Invalid entity name');
  integer(anchor.blockNumber); hash32(anchor.blockHash);
  const rows: any[] = []; let last = ''; const seen = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    const data = await query(url, `{ _meta(block:{hash:${JSON.stringify(anchor.blockHash)}}){block{number hash} hasIndexingErrors}
      ${field}(first:1000,orderBy:id,orderDirection:asc,block:{hash:${JSON.stringify(anchor.blockHash)}},where:{id_gt:${JSON.stringify(last)}${where ? ',' + where : ''}}){id ${fields}} }`);
    if (!data._meta || data._meta.hasIndexingErrors !== false || data._meta.block.number !== anchor.blockNumber ||
        data._meta.block.hash?.toLowerCase() !== anchor.blockHash.toLowerCase()) throw new Error('Indexer is partial, lagging, or on a different block');
    const batch = data[field]; if (!Array.isArray(batch) || batch.length > 1000) throw new Error('Invalid indexer page');
    for (const row of batch) {
      if (typeof row.id !== 'string' || row.id <= last || seen.has(row.id)) throw new Error('Duplicate/non-monotonic indexer page');
      seen.add(row.id); last = row.id; rows.push(row);
    }
    if (batch.length < 1000) return rows;
  }
  throw new Error('Indexer pagination limit reached; refusing truncated history');
}
export function decimalToUnits(value: string, decimals = 18): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) throw new Error('Invalid exact decimal quantity');
  const [whole, fractional = ''] = value.split('.');
  if (fractional.length > decimals && /[1-9]/.test(fractional.slice(decimals))) throw new Error('Quantity exceeds token precision');
  return (BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt((fractional.slice(0, decimals).padEnd(decimals, '0')) || '0')).toString();
}
const engineABI = ['function safes(bytes32,address) view returns(uint256 lockedCollateral,uint256 generatedDebt)',
  'function cData(bytes32) view returns(uint256 debtAmount,uint256 lockedAmount,uint256 accumulatedRate,uint256 safetyPrice,uint256 liquidationPrice)'];
/** Enumerated historical SAFE state is independently reconciled to on-chain per-SAFE and aggregate principal. */
export async function vaultPositions(source: VaultExportSource, p: AeroPolicy, anchor: Anchor, client: providers.Provider,
  query: Query = graphQuery): Promise<{ positions: Position[]; proxies: string[]; digest: string }> {
  const policy = p.sources[source.source];
  if (!policy || policy.kind !== 'vault' || !policy.collateralType || policy.chainId !== anchor.chainId) throw new Error('Explicit vault collateral type and chain required');
  if (await client.getCode(address(policy.eligibleToken), anchor.blockNumber) === '0x') throw new Error('Eligible collateral token is not deployed at snapshot');
  const decimals = await new Contract(policy.eligibleToken, ['function decimals() view returns(uint8)'], client).decimals({ blockTag: anchor.blockNumber });
  if (decimals !== 18) throw new Error('Eligible wrapper principal must have 18 decimals');
  const ctype = utils.formatBytes32String(policy.collateralType);
  const rows = await pinnedRows(source.subgraphUrl, 'safes', 'safeId safeHandler collateral owner{address} proxy{address}',
    `collateralType:${JSON.stringify(policy.collateralType)},collateral_gt:"0"`, anchor, query);
  const engine = new Contract(policy.contract, engineABI, client);
  const manager = new Contract(address(source.manager), ['function safeData(uint256) view returns(address owner,address pendingOwner,address safeHandler,bytes32 collateralType)'], client);
  const positions: Position[] = [], proxies = new Set<string>(); let sum = BigInt(0);
  await parallelRows(rows, async row => {
    const a = decimalToUnits(row.collateral), owner = address(row.owner?.address), handler = address(row.safeHandler);
    const state = await engine.safes(ctype, handler, { blockTag: anchor.blockNumber });
    if (state.lockedCollateral.toString() !== a) throw new Error('Indexer SAFE principal differs from chain');
    const safe = await manager.safeData(amount(row.safeId).toString(), { blockTag: anchor.blockNumber });
    if (address(safe.safeHandler) !== handler || safe.collateralType.toLowerCase() !== ctype.toLowerCase()) throw new Error('Indexer SAFE identity differs from manager');
    if (address(safe.owner) !== owner) {
      const proxyOwner = await new Contract(safe.owner, ['function owner() view returns(address)'], client).owner({ blockTag: anchor.blockNumber });
      if (address(proxyOwner) !== owner) throw new Error('Historical SAFE owner differs from chain');
      proxies.add(address(safe.owner));
    }
    if (row.proxy?.address) proxies.add(address(row.proxy.address));
    sum += amount(a); positions.push({ id: `${source.source}:${row.id}`, source: source.source, owner, amount: a });
  });
  positions.sort((a, b) => a.id.localeCompare(b.id));
  const aggregate = await engine.cData(ctype, { blockTag: anchor.blockNumber });
  if (aggregate.accumulatedRate.isZero()) throw new Error('Collateral type is not initialized at snapshot');
  if (aggregate.lockedAmount.toString() !== sum.toString()) throw new Error('Indexer omitted collateral: total principal does not reconcile');
  return { positions, proxies: [...proxies], digest: digest(rows) };
}
async function stakingSnapshot(s: StakingExportSource, anchor: Anchor, client: providers.Provider): Promise<Record<string, string>> {
  const rows = await pinnedRows(s.subgraphUrl, s.userEntity, '', '', anchor);
  const contract = new Contract(address(s.contract), ['function stakedBalances(address) view returns(uint256)', 'function totalStaked() view returns(uint256)'], client);
  const users: Record<string, string> = {}; let sum = BigInt(0);
  await parallelRows(rows, async row => {
    const owner = address(row.id); if (users[owner] !== undefined) throw new Error('Duplicate staking user');
    const value = (await contract.stakedBalances(owner, { blockTag: anchor.blockNumber })).toString();
    users[owner] = value; sum += amount(value);
  });
  if ((await contract.totalStaked({ blockTag: anchor.blockNumber })).toString() !== sum.toString()) throw new Error('Indexer omitted staking users: total stake does not reconcile');
  return Object.fromEntries(Object.entries(users).sort(([a], [b]) => a.localeCompare(b)));
}
/** Snapshot at every observed state-changing block, across chains. Never reuses current LP supply historically. */
export async function exportAeroInput(config: ExportConfig, baseline: LegacySnapshot, batches: RevenueBatch[],
  clients?: Record<string, providers.Provider>): Promise<{ input: AeroInput; evidence: unknown }> {
  integer(config.start); integer(config.end); if (config.start >= config.end) throw new Error('Invalid export interval');
  if (config.policy.cutover !== baseline.cutover) throw new Error('Explicit reviewed cutoff mismatch');
  if (!config.skite && config.policy.boost.mode !== 'none') throw new Error('sKITE indexer required for boost');
  const active = (source: string, time: number) => { const p = config.policy.sources[source]; return time >= (p.eligibleFrom ?? 0) && time < (p.eligibleUntil ?? Number.MAX_SAFE_INTEGER); };
  const sources = [...config.vaults.map(s => s.source), ...config.lpStaking.map(s => s.source!)];
  if (new Set(sources).size !== sources.length || sources.length !== Object.keys(config.policy.sources).length || sources.some(s => !config.policy.sources[s])) throw new Error('Every eligible source must have exactly one exporter');
  const ps: Record<string, providers.Provider> = clients || Object.fromEntries(Object.entries(config.chains).map(([id, c]) => [id, new providers.StaticJsonRpcProvider(c.rpcUrl)]));
  const verifier = new RpcEvidenceVerifier(ps), blockCache = new Map<string, providers.Block>();
  const block = async (chain: number, n: number) => { const key = `${chain}:${n}`; if (!blockCache.has(key)) { const b = await ps[String(chain)].getBlock(n); if (!b) throw new Error('Missing historical block'); blockCache.set(key, b); } return blockCache.get(key)!; };
  const anchor = async (chain: number, n: number): Promise<Anchor> => ({ chainId: chain, blockNumber: n, blockHash: (await block(chain, n)).hash });
  const atTime = async (chain: number, time: number): Promise<number> => {
    const c = config.chains[String(chain)]; if (!c) throw new Error('Missing configured chain'); let low = c.fromBlock, high = c.toBlock;
    while (low < high) { const mid = Math.ceil((low + high) / 2); if ((await block(chain, mid)).timestamp <= time) low = mid; else high = mid - 1; }
    return low;
  };
  const anchors: Anchor[] = [];
  for (const [id, c] of Object.entries(config.chains)) {
    const chain = Number(id); integer(chain); integer(c.fromBlock); integer(c.toBlock);
    if (c.fromBlock > c.toBlock || (await block(chain, c.fromBlock)).timestamp > config.start || (await block(chain, c.toBlock)).timestamp < config.end) throw new Error('Chain bounds do not cover export interval');
    const a = { chainId: chain, blockNumber: c.toBlock, blockHash: c.toBlockHash }; await verifier.verifyAnchor(a, config.end); anchors.push(a);
  }
  const vaultCache = new Map<string, Promise<Awaited<ReturnType<typeof vaultPositions>>>>();
  const vaultAt = async (s: VaultExportSource, chain: number, time: number) => {
    const n = await atTime(chain, time), key = `${s.source}:${n}`;
    if (!vaultCache.has(key)) vaultCache.set(key, vaultPositions(s, config.policy, await anchor(chain, n), ps[String(chain)]));
    return vaultCache.get(key)!;
  };
  const watches = new Map<string, { chain: number; address: string }>();
  const watch = (chain: number, addr: string) => { address(addr); if (!config.chains[String(chain)]) throw new Error('Missing source chain'); watches.set(`${chain}:${addr.toLowerCase()}`, { chain, address: addr }); };
  for (const s of config.vaults) {
    const p = config.policy.sources[s.source]; watch(p.chainId, p.contract); watch(p.chainId, s.manager);
    // Gather proxies from both endpoints, then again at every discovered boundary below.
    for (const time of [config.start, config.end]) {
      if (!active(s.source, time)) continue;
      const result = await vaultAt(s, p.chainId, time);
      result.proxies.forEach(a => watch(p.chainId, a));
    }
  }
  for (const s of [...config.lpStaking, ...(config.skite ? [config.skite] : [])]) { watch(s.chainId, s.contract); if (s.pool) watch(s.chainId, s.pool); }
  const times = new Set<number>([config.start, config.end]);
  for (const source of Object.values(config.policy.sources)) for (const time of [source.eligibleFrom, source.eligibleUntil]) {
    if (time !== undefined) { integer(time); if (time > config.start && time < config.end) times.add(time); }
  }
  const scanned = new Set<string>(), eventKeys = new Set<string>();
  const chunk = config.logChunkSize ?? 2000; integer(chunk); if (chunk < 1 || chunk > 10000) throw new Error('Invalid log chunk size');
  // Scanning all emitter logs is conservative and includes liquidations, transfers, ownership changes and LP supply changes.
  const scan = async () => {
    for (const [key, w] of watches) {
      if (scanned.has(key)) continue; scanned.add(key); const c = config.chains[String(w.chain)];
      for (let from = c.fromBlock; from <= c.toBlock; from += chunk) {
        const logs = await ps[String(w.chain)].getLogs({ address: w.address, fromBlock: from, toBlock: Math.min(c.toBlock, from + chunk - 1) });
        for (const log of logs) {
          const id = `${w.chain}:${log.transactionHash.toLowerCase()}:${log.logIndex}`; if (eventKeys.has(id)) throw new Error('Duplicate source log'); eventKeys.add(id);
          const b = await block(w.chain, log.blockNumber); if (log.removed || log.blockHash !== b.hash) throw new Error('Noncanonical source event');
          if (b.timestamp > config.start && b.timestamp < config.end) times.add(b.timestamp);
        }
      }
    }
  };
  await scan();
  const windows: AeroInput['windows'] = []; const evidence: any[] = [];
  // New proxy discovery must not silently omit a mid-window ownership event: rescan and rebuild boundaries until stable.
  for (let pass = 0; pass < 10; pass++) {
    windows.length = 0; evidence.length = 0; const sorted = [...times].sort((a, b) => a - b); const before = watches.size;
    for (let n = 0; n + 1 < sorted.length; n++) {
      const start = sorted[n], end = sorted[n + 1]; const positions: Position[] = []; let skite: Record<string, string> = {};
      for (const s of config.vaults) {
        if (!active(s.source, start)) continue;
        const chain = config.policy.sources[s.source].chainId, a = await anchor(chain, await atTime(chain, start));
        const r = await vaultAt(s, chain, start); positions.push(...r.positions); r.proxies.forEach(p => watch(chain, p)); evidence.push({ source: s.source, anchor: a, rowsHash: r.digest });
      }
      for (const s of config.lpStaking) {
        if (!active(s.source!, start)) continue;
        const policy = config.policy.sources[s.source!]; if (policy.kind !== 'lp' || policy.chainId !== s.chainId || address(policy.contract) !== address(s.contract) || !s.pool) throw new Error('Explicit LP manager/pool binding required');
        const a = await anchor(s.chainId, await atTime(s.chainId, start)), client = ps[String(s.chainId)];
        const underlying = await new Contract(s.contract, ['function protocolToken() view returns(address)'], client).protocolToken({ blockTag: a.blockNumber });
        if (address(underlying) !== address(s.pool)) throw new Error('LP pool is not staking manager underlying');
        const users = await stakingSnapshot(s, a, client);
        const pool = new Contract(s.pool, ['function token0() view returns(address)', 'function token1() view returns(address)', 'function getReserves() view returns(uint256,uint256,uint256)', 'function totalSupply() view returns(uint256)'], client);
        const opts = { blockTag: a.blockNumber }, token0 = address(await pool.token0(opts)), token1 = address(await pool.token1(opts)), eligible = address(policy.eligibleToken);
        if (eligible !== token0 && eligible !== token1) throw new Error('Eligible wrapper is not a pool token');
        const reserves = await pool.getReserves(opts), supply = (await pool.totalSupply(opts)).toString();
        for (const [owner, balance] of Object.entries(users)) if (amount(balance) > BigInt(0)) positions.push({ id: `${s.source}:${owner}`, source: s.source!, owner, amount: balance, lp: { eligibleReserve: reserves[eligible === token0 ? 0 : 1].toString(), totalSupply: supply } });
        evidence.push({ source: s.source, anchor: a, usersHash: digest(users), pool: s.pool, supply });
      }
      if (config.skite) {
        const s = config.skite, a = await anchor(s.chainId, await atTime(s.chainId, start));
        skite = await stakingSnapshot(s, a, ps[String(s.chainId)]);
        evidence.push({ source: 'skite-boost', anchor: a, usersHash: digest(skite) });
      }
      windows.push({ start, end, anchors, positions, skite });
    }
    if (watches.size === before) return { input: { policy: config.policy, baseline, windows, batches }, evidence: { sources: evidence, sourceEventCount: eventKeys.size, sourceEventsHash: digest([...eventKeys].sort()), anchors } };
    await scan();
  }
  throw new Error('Ownership history did not converge');
}
