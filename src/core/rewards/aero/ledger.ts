import { createHash } from 'crypto';
import { utils } from 'ethers';
import { AeroInput, AeroLedger, AeroPolicy, ExactRewards, EvidenceVerifier, PositionWindow, RevenueBatch, Regime } from './types';
const Z = BigInt(0), O = BigInt(1);
type Q = { n: bigint; d: bigint };
function gcd(a: bigint, b: bigint): bigint { while (b) { const r = a % b; a = b; b = r; } return a; }
function q(n: bigint, d = O): Q { if (d <= Z || n < Z) throw new Error('Invalid rational'); const g = gcd(n, d); return { n: n / g, d: d / g }; }
const add = (a: Q, b: Q): Q => q(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q): Q => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q): Q => q(a.n * b.d, a.d * b.n);
const less = (a: Q, b: Q): boolean => a.n * b.d < b.n * a.d;
export function amount(value: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`Invalid base-unit amount: ${value}`);
  return BigInt(value);
}
export function address(value: string): string {
  if (!utils.isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error(`Invalid address: ${value}`);
  return value.toLowerCase();
}
export function integer(n: number): void { if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid timestamp/block/index'); }
export function hash32(value: string): void { if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error('Invalid hash'); }
function stable(x: any): any {
  if (Array.isArray(x)) return x.map(stable);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])]));
  return x;
}
export const digest = (x: unknown): string => createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
export function receiptKey(b: Pick<RevenueBatch, 'chainId' | 'transactionHash' | 'logIndex'>): string {
  integer(b.chainId); integer(b.logIndex); hash32(b.transactionHash);
  return `${b.chainId}:${b.transactionHash.toLowerCase()}:${b.logIndex}`;
}
function range(start: number, end: number): void { integer(start); integer(end); if (start >= end) throw new Error('Empty or inverted earning window'); }
function validatePolicy(p: AeroPolicy): void {
  if (p.version !== 1) throw new Error('Unsupported Aero policy version');
  integer(p.cutover);
  if (!p.boost || !['none', 'skite-share'].includes(p.boost.mode) || ![10000, 20000].includes(p.boost.maxBps) ||
      (p.boost.mode === 'none' && p.boost.maxBps !== 10000) || (p.boost.mode === 'skite-share' && p.boost.maxBps !== 20000)) throw new Error('Explicit 1x or unified sKITE 2x boost required');
  if (!Object.keys(p.sources).length || !Object.keys(p.payoutTokens).length) throw new Error('Missing eligible sources or payout tokens');
  for (const s of Object.values(p.sources)) {
    integer(s.chainId); address(s.contract); address(s.eligibleToken);
    if (s.eligibleFrom !== undefined) integer(s.eligibleFrom);
    if (s.eligibleUntil !== undefined) { integer(s.eligibleUntil); if (s.eligibleUntil <= (s.eligibleFrom ?? 0)) throw new Error('Invalid source eligibility interval'); }
    if (!['legacy-velo', 'legacy-aero', 'new-aero'].includes(s.asset) || !['vault', 'lp'].includes(s.kind)) throw new Error('Invalid eligible position source');
  }
  const tokens = new Set<string>();
  for (const [symbol, t] of Object.entries(p.payoutTokens)) {
    integer(t.chainId); integer(t.decimals); address(t.address);
    if (t.decimals > 36 || symbol !== symbol.toUpperCase()) throw new Error('Invalid payout token');
    const key = `${t.chainId}:${t.address.toLowerCase()}`;
    if (tokens.has(key)) throw new Error('Payout token aliases would double count'); tokens.add(key);
    const c = p.collectors[String(t.chainId)]; if (!c || !c.senders.length) throw new Error('Missing collector/senders');
    address(c.recipient); c.senders.forEach(address);
  }
}
function weights(w: PositionWindow, p: AeroPolicy, regime: Regime): Map<string, Q> {
  const users = new Map<string, Q>(); const ids = new Set<string>();
  for (const pos of w.positions) {
    const src = p.sources[pos.source]; if (!src) throw new Error(`Unknown eligible source ${pos.source}`);
    if (w.start < (src.eligibleFrom ?? 0) || w.end > (src.eligibleUntil ?? Number.MAX_SAFE_INTEGER)) throw new Error('Position outside reviewed source eligibility');
    if (!pos.id || ids.has(pos.id)) throw new Error('Duplicate/missing position ID'); ids.add(pos.id);
    const owner = address(pos.owner); const a = amount(pos.amount);
    if ((src.kind === 'lp') !== Boolean(pos.lp)) throw new Error('LP reserve data required only for LP sources');
    if (regime !== 'unified' && src.asset !== regime) continue;
    let weight = q(a);
    if (pos.lp) {
      const supply = amount(pos.lp.totalSupply), reserve = amount(pos.lp.eligibleReserve);
      if (supply === Z || a > supply) throw new Error('Invalid LP supply/balance');
      weight = mul(weight, q(reserve, supply));
    }
    // Common normalized AERO numerator: avoids rounding each VELO position at 0.044.
    weight = mul(weight, q(src.asset === 'legacy-velo' ? BigInt(44) : BigInt(1000)));
    users.set(owner, add(users.get(owner) || q(Z), weight));
  }
  let total = q(Z); for (const v of users.values()) total = add(total, v);
  const staking = new Map<string, bigint>(); let totalStaking = Z;
  for (const [a, v] of Object.entries(w.skite)) {
    const owner = address(a); if (staking.has(owner)) throw new Error('Duplicate sKITE address');
    staking.set(owner, amount(v)); totalStaking += amount(v);
  }
  if (p.boost.mode === 'skite-share' && totalStaking > Z) for (const [owner, weight] of users) {
    const supported = add(weight, mul(total, q(staking.get(owner) || Z, totalStaking)));
    const cap = mul(weight, q(BigInt(p.boost.maxBps), BigInt(10000)));
    users.set(owner, less(supported, cap) ? supported : cap);
  }
  return users;
}
function allocate(slice: RevenueBatch['slices'][number], windows: PositionWindow[], p: AeroPolicy): Map<string, bigint> {
  const reward = amount(slice.amount); const totals = new Map<string, Q>(); let cursor = slice.start;
  for (const w of windows.filter(w => w.end > slice.start && w.start < slice.end)) {
    const start = Math.max(slice.start, w.start), end = Math.min(slice.end, w.end);
    if (start !== cursor) throw new Error('Position coverage gap or overlap'); cursor = end;
    const ws = weights(w, p, slice.regime); let sum = q(Z); for (const v of ws.values()) sum = add(sum, v);
    if (sum.n === Z && reward > Z) throw new Error('Revenue has no eligible weight');
    if (sum.n === Z) continue;
    const intervalReward = q(reward * BigInt(end - start), BigInt(slice.end - slice.start));
    for (const [owner, weight] of ws) totals.set(owner, add(totals.get(owner) || q(Z), mul(intervalReward, div(weight, sum))));
  }
  if (cursor !== slice.end) throw new Error('Missing complete position history');
  const allocations = new Map<string, bigint>(); let used = Z;
  const ranked = [...totals].map(([owner, v]) => { const n = v.n / v.d; allocations.set(owner, n); used += n; return { owner, remainder: q(v.n % v.d, v.d) }; })
    .sort((a, b) => less(a.remainder, b.remainder) ? 1 : less(b.remainder, a.remainder) ? -1 : a.owner.localeCompare(b.owner));
  let remaining = reward - used;
  for (const x of ranked) { if (remaining === Z) break; allocations.set(x.owner, allocations.get(x.owner)! + O); remaining--; }
  if (remaining !== Z) throw new Error('Allocation conservation failed');
  return allocations;
}
/** Hash only the economic history actually used by each slice. Extending an export or
 * refreshing its finality anchor must not rewrite already accepted allocations. */
function receiptHistory(batch: RevenueBatch, windows: PositionWindow[]): unknown {
  return batch.slices.map(slice => {
    const intervals: { start: number; end: number; state: string }[] = [];
    for (const w of windows.filter(w => w.end > slice.start && w.start < slice.end)) {
      const state = digest({ positions: [...w.positions].sort((a, b) => a.id.localeCompare(b.id)), skite: w.skite });
      const start = Math.max(w.start, slice.start), end = Math.min(w.end, slice.end), prior = intervals[intervals.length - 1];
      if (prior && prior.end === start && prior.state === state) prior.end = end;
      else intervals.push({ start, end, state });
    }
    return intervals;
  });
}
/** Exact, deterministic cumulative calculation. It never subtracts claims or writes a ledger. */
export async function calculateAeroLedger(input: AeroInput, verifier: EvidenceVerifier): Promise<AeroLedger> {
  const { policy: p, baseline, batches } = input; validatePolicy(p);
  if (baseline.cutover !== p.cutover) throw new Error('Legacy cutover mismatch');
  const policyHash = digest(p), baselineHash = digest(baseline);
  if (input.previous && (input.previous.version !== 1 || input.previous.policyHash !== policyHash || input.previous.baselineHash !== baselineHash)) throw new Error('Prior ledger policy/baseline changed');
  const windows = [...input.windows].sort((a, b) => a.start - b.start);
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]; range(w.start, w.end);
    if (i && w.start < windows[i - 1].end) throw new Error('Overlapping position windows');
    const chainIds = new Set(w.anchors.map(a => a.chainId));
    for (const pos of w.positions) if (!p.sources[pos.source] || !chainIds.has(p.sources[pos.source].chainId)) throw new Error('Position source missing finalized anchor');
    if (!w.anchors.length) throw new Error('Position window requires finalized anchors');
    for (const a of w.anchors) await verifier.verifyAnchor(a, w.end);
    weights(w, p, 'unified'); // validate even when a slice has zero rewards
  }
  const balances: Record<string, Map<string, bigint>> = {};
  for (const [token, entries] of Object.entries(baseline.cumulative)) {
    if (!p.payoutTokens[token]) throw new Error(`Unmapped legacy payout token ${token}`);
    balances[token] = new Map();
    for (const x of entries) { const a = address(x.address); if (balances[token].has(a)) throw new Error('Duplicate baseline owner'); balances[token].set(a, amount(x.earned)); }
  }
  const covered = new Set(baseline.coveredReceipts.map(x => x.toLowerCase()));
  if (covered.size !== baseline.coveredReceipts.length || [...covered].some(x => !/^\d+:0x[0-9a-f]{64}:\d+$/.test(x))) throw new Error('Invalid/duplicate baseline receipt coverage');
  const receipts: Record<string, string> = {}, allocated: Record<string, string> = {};
  for (const b of [...batches].sort((a, b) => receiptKey(a).localeCompare(receiptKey(b)))) {
    const key = receiptKey(b);
    if (covered.has(key) || receipts[key]) throw new Error(`Duplicate/already-covered revenue receipt ${key}`);
    if (!b.accountingReference?.trim()) throw new Error('Missing reviewed revenue accounting reference');
    if (!p.payoutTokens[b.token] || p.payoutTokens[b.token].chainId !== b.chainId) throw new Error('Unmapped receipt token/chain');
    if (amount(b.amount) === Z || !b.slices.length) throw new Error('Empty revenue batch');
    let total = Z;
    for (const s of b.slices) {
      range(s.start, s.end); total += amount(s.amount);
      if (!['unified', 'legacy-velo', 'legacy-aero'].includes(s.regime)) throw new Error('Unknown earning regime');
      if (s.regime === 'unified' ? s.start < p.cutover : s.end > p.cutover) throw new Error('Earning window crosses policy cutover; split explicitly');
    }
    if (total !== amount(b.amount)) throw new Error('Revenue slice totals differ from funded receipt');
    await verifier.verifyReceipt(b, p);
    for (const regime of ['unified', 'legacy-velo', 'legacy-aero']) {
      const slices = b.slices.filter(s => s.regime === regime).sort((a, b) => a.start - b.start);
      if (slices.some((s, i) => i > 0 && s.start < slices[i - 1].end)) throw new Error('Overlapping earning slices within revenue batch');
    }
    receipts[key] = digest({ batch: b, history: receiptHistory(b, windows) });
    if (input.previous?.receipts[key] && input.previous.receipts[key] !== receipts[key]) throw new Error('Previously allocated receipt/history changed');
    balances[b.token] ||= new Map();
    for (const s of b.slices) for (const [owner, value] of allocate(s, windows, p)) balances[b.token].set(owner, (balances[b.token].get(owner) || Z) + value);
    allocated[b.token] = (amount(allocated[b.token] || '0') + amount(b.amount)).toString();
  }
  for (const key of Object.keys(input.previous?.receipts || {})) if (!receipts[key]) throw new Error('Previously allocated receipt was removed');
  const cumulative: ExactRewards = {};
  for (const token of Object.keys(balances).sort()) cumulative[token] = [...balances[token]].sort(([a], [b]) => a.localeCompare(b)).map(([a, n]) => ({ address: a, earned: n.toString() }));
  return { version: 1, policyHash, baselineHash, receipts, cumulative, allocated };
}
