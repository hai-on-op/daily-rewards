import { BigNumber, utils } from 'ethers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { calculateAeroLedger, receiptKey } from './ledger';
import { mergeExactRewards } from './distribution';
import { AeroInput, EvidenceVerifier } from './types';
import { subtractClaimedRewards } from '../../../services/claim-accounting';
const alice = '0x0000000000000000000000000000000000000001';
const bob = '0x0000000000000000000000000000000000000002';
const collector = '0x0000000000000000000000000000000000000003';
const reward = '0x0000000000000000000000000000000000000004';
const H = '0x' + 'ab'.repeat(32);
const verifier: EvidenceVerifier = { verifyAnchor: jest.fn(async () => {}), verifyReceipt: jest.fn(async () => {}) };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
function fixture(): AeroInput {
  return {
    policy: { version: 1, cutover: 100, boost: { mode: 'none', maxBps: 10000 }, sources: {
      veloVault: { chainId: 10, contract: collector, eligibleToken: reward, asset: 'legacy-velo', kind: 'vault' }, aeroVault: { chainId: 10, contract: collector, eligibleToken: reward, asset: 'new-aero', kind: 'vault' },
      veloLp: { chainId: 10, contract: collector, eligibleToken: reward, asset: 'legacy-velo', kind: 'lp' },
    }, payoutTokens: { HAI: { chainId: 10, address: reward, decimals: 18 } }, collectors: { '10': { recipient: collector, senders: [alice] } } },
    baseline: { cutover: 100, cumulative: { HAI: [{ address: alice, earned: '100' }] }, coveredReceipts: [] },
    windows: [{ start: 100, end: 200, anchors: [{ chainId: 10, blockNumber: 1000, blockHash: H }], skite: {}, positions: [
      { id: 'safe-1', source: 'veloVault', owner: alice, amount: '1000' },
      { id: 'safe-2', source: 'aeroVault', owner: bob, amount: '44' },
    ] }],
    batches: [{ chainId: 10, transactionHash: H, logIndex: 0, blockNumber: 1000, blockHash: H, token: 'HAI', sender: alice,
      amount: '101', accountingReference: 'reviewed earned 100-200', slices: [{ start: 100, end: 200, amount: '101', regime: 'unified' }] }],
  };
}
const earned = (r: Awaited<ReturnType<typeof calculateAeroLedger>>, a: string): string => r.cumulative.HAI.find(x => x.address === a)?.earned || '0';
describe('Aero continuous revenue ledger', () => {
  it('normalizes VELO at 44/1000 and allocates every unit deterministically', async () => {
    const r = await calculateAeroLedger(fixture(), verifier);
    expect(earned(r, alice)).toBe('151'); expect(earned(r, bob)).toBe('50');
    expect(r.allocated.HAI).toBe('101'); expect(verifier.verifyAnchor).toHaveBeenCalledWith(expect.anything(), 200);
  });
  it('uses historical LP eligible reserve and supply without double counting the paired token', async () => {
    const x = fixture(); x.windows[0].positions[0] = { id: 'lp-1', source: 'veloLp', owner: alice, amount: '10', lp: { eligibleReserve: '10000', totalSupply: '100' } };
    expect(earned(await calculateAeroLedger(x, verifier), alice)).toBe('151');
    x.windows[0].positions[0].lp!.totalSupply = '0'; await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('LP');
  });
  it('applies one explicit sKITE boost across normalized old and new vault/LP holdings', async () => {
    const x = fixture(); x.policy.boost = { mode: 'skite-share', maxBps: 20000 }; x.windows[0].skite = { [alice]: '1' };
    const r = await calculateAeroLedger(x, verifier); expect(earned(r, alice)).toBe('167'); expect(earned(r, bob)).toBe('34');
  });
  it('respects time-varying ownership and exact large amounts beyond JS safe integer', async () => {
    const x = fixture(); x.batches[0].amount = '1000000000000000000000001'; x.batches[0].slices[0].amount = x.batches[0].amount;
    x.windows[0].end = 150; const next = clone(x.windows[0]); next.start = 150; next.end = 200; next.positions = [next.positions[0]]; x.windows.push(next);
    const r = await calculateAeroLedger(x, verifier);
    expect(BigInt(earned(r, alice)) + BigInt(earned(r, bob))).toBe(BigInt(x.batches[0].amount) + BigInt(100));
    expect(BigInt(earned(r, alice))).toBeGreaterThan(BigInt(earned(r, bob)) * BigInt(2));
  });
  it('routes a late pre-migration receipt by earning window, not payment time', async () => {
    const x = fixture(); x.windows[0].start = 0; x.windows[0].end = 100;
    x.batches[0].slices[0] = { start: 0, end: 100, regime: 'legacy-velo', amount: '101' };
    expect(earned(await calculateAeroLedger(x, verifier), alice)).toBe('201');
    x.batches[0].slices[0].end = 101; await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('cutover');
  });
  it('rejects duplicate receipt, baseline-covered receipt, missing history and empty weight', async () => {
    let x = fixture(); x.batches.push(clone(x.batches[0])); await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('Duplicate');
    x = fixture(); x.baseline.coveredReceipts.push(receiptKey(x.batches[0])); await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('covered');
    x = fixture(); x.windows[0].start++; await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('coverage');
    x = fixture(); x.windows[0].positions = []; await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('no eligible');
  });
  it('makes retries identical, supports append, rejects historical rewrites/removal', async () => {
    const x = fixture(), first = await calculateAeroLedger(x, verifier); x.previous = first;
    expect(await calculateAeroLedger(x, verifier)).toEqual(first);
    const appended = clone(x.batches[0]); appended.logIndex = 1; x.batches.push(appended);
    expect(earned(await calculateAeroLedger(x, verifier), alice)).toBe('202');
    x.windows[0].positions[0].amount = '999'; await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('history changed');
    x.windows[0].positions[0].amount = '1000'; x.batches = []; await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('removed');
  });
  it('preserves receipt identity when later exports extend, split or refresh finality anchors', async () => {
    const x = fixture(), first = await calculateAeroLedger(x, verifier); x.previous = first;
    x.windows[0].end = 300; x.windows[0].anchors[0].blockNumber = 2000;
    expect(await calculateAeroLedger(x, verifier)).toEqual(first);
    const next = clone(x.windows[0]); x.windows[0].end = 150; next.start = 150; x.windows.push(next);
    expect(await calculateAeroLedger(x, verifier)).toEqual(first);
    next.positions[0].owner = bob;
    await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('history changed');
  });
  it('rejects positions that cross a reviewed source activation boundary', async () => {
    const x = fixture(); x.policy.sources.aeroVault.eligibleFrom = 150;
    await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('source eligibility');
  });
  it('rejects overlapping slices of the same earning regime in one funded receipt', async () => {
    const x = fixture(); x.batches[0].slices[0].amount = '50';
    x.batches[0].slices.push({ start: 150, end: 200, amount: '51', regime: 'unified' });
    await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('Overlapping earning slices');
  });
  it('fails closed on receipt proof errors and conservation mismatches', async () => {
    const x = fixture(); await expect(calculateAeroLedger(x, { ...verifier, verifyReceipt: async () => { throw new Error('not finalized'); } })).rejects.toThrow('not finalized');
    x.batches[0].slices[0].amount = '100'; await expect(calculateAeroLedger(x, verifier)).rejects.toThrow('totals');
  });
  it('preserves cumulative legacy entitlement and subtracts the same claims once before Merkle output', async () => {
    const r = await calculateAeroLedger(fixture(), verifier);
    const combined = mergeExactRewards(r.cumulative, { HAI: [{ address: alice, earned: '20' }] });
    const claims = new Map([[alice, '125']]);
    const remaining = subtractClaimedRewards(combined.HAI, claims, BigNumber.from(0));
    expect(remaining).toEqual([{ address: alice, earned: '46' }, { address: bob, earned: '50' }]);
    const tree = StandardMerkleTree.of(remaining.map(r => [r.address, r.earned]), ['address', 'uint256']);
    const retry = await calculateAeroLedger({ ...fixture(), previous: r }, verifier);
    expect(retry).toEqual(r); expect(utils.isHexString(tree.root, 32)).toBe(true);
    expect(tree.verify(0, tree.getProof(0))).toBe(true);
  });
});
