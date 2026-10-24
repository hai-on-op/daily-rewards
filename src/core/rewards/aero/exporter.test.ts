import axios from 'axios';
import { utils } from 'ethers';
import { decimalToUnits, pinnedRows, exportAeroInput, ExportConfig } from './exporter';
jest.mock('axios');
const addr = (n: number) => '0x' + n.toString(16).padStart(40, '0');
const h = (n: number) => '0x' + n.toString(16).padStart(64, '0');
const anchor = { chainId: 10, blockNumber: 20, blockHash: h(20) };
it('converts Graph BigDecimal strings exactly, rejecting scientific notation and lost precision', () => {
  expect(decimalToUnits('117152.88900473107')).toBe('117152889004731070000000');
  expect(decimalToUnits('9007199254740993.000000000000000001')).toBe('9007199254740993000000000000000001');
  expect(() => decimalToUnits('1e6')).toThrow(); expect(() => decimalToUnits('1.0000000000000000001')).toThrow();
});
it('paginates with exact block pin and fails duplicate, lagging and partial pages', async () => {
  const query = jest.fn(async (_u: string, q: string) => ({ _meta: { block: { number: 20, hash: h(20) }, hasIndexingErrors: false }, safes: q.includes('id_gt:""') ? Array.from({ length: 1000 }, (_, n) => ({ id: n.toString().padStart(5, '0') })) : [{ id: '01000' }] }));
  expect((await pinnedRows('mock', 'safes', '', '', anchor, query)).length).toBe(1001);
  expect(query.mock.calls[1][1]).toContain('id_gt:"00999"');
  expect(query.mock.calls[1][1]).toContain(`block:{hash:"${h(20)}"}`);
  await expect(pinnedRows('mock', 'safes', '', '', anchor, async () => ({ _meta: { block: { number: 19, hash: h(20) } }, safes: [] }))).rejects.toThrow('partial');
  await expect(pinnedRows('mock', 'safes', '', '', anchor, async () => ({ _meta: { block: { number: 20, hash: h(20) }, hasIndexingErrors: false }, safes: [{ id: 'x' }, { id: 'x' }] }))).rejects.toThrow('Duplicate');
  await expect(pinnedRows('mock', 'safes', '', '', anchor, query, 1)).rejects.toThrow('pagination limit');
});
function fixture() {
  const config: ExportConfig = { start: 100, end: 200, chains: { '10': { rpcUrl: 'https://mock.invalid', fromBlock: 10, toBlock: 20, toBlockHash: h(20) } },
    policy: { version: 1, cutover: 100, boost: { mode: 'none', maxBps: 10000 }, sources: { v: { chainId: 10, contract: addr(3), eligibleToken: addr(4), asset: 'new-aero', kind: 'vault', collateralType: 'HAIAERO3' } }, payoutTokens: {}, collectors: {} },
    vaults: [{ source: 'v', subgraphUrl: 'https://mock.invalid', manager: addr(5) }], lpStaking: [], skite: null, baseline: { file: 'baseline', sha256: '' }, batches: { file: 'batches', sha256: '' } };
  const iface = new utils.Interface(['function decimals() view returns(uint8)', 'function safes(bytes32,address) view returns(uint256,uint256)', 'function cData(bytes32) view returns(uint256,uint256,uint256,uint256,uint256)', 'function safeData(uint256) view returns(address,address,address,bytes32)']);
  const client = { _isProvider: true, getNetwork: async () => ({ chainId: 10 }), getCode: async () => '0x6000', resolveName: async (a: string) => a,
    getBlock: async (b: any) => ({ number: b === 'finalized' ? 20 : b, hash: h(b === 'finalized' ? 20 : b), timestamp: (b === 'finalized' ? 20 : b) * 10 }),
    getLogs: async (f: any) => f.address === addr(5) ? [{ transactionHash: h(99), logIndex: 1, blockNumber: 15, blockHash: h(15), removed: false }] : [],
    call: async (tx: any, tag: number) => { const method = iface.parseTransaction({ data: tx.data }).name;
      return iface.encodeFunctionResult(method, method === 'decimals' ? [18] : method === 'safes' ? [utils.parseEther('10'), 0] : method === 'cData' ? [0, utils.parseEther('10'), 1, 0, 0] : [addr(tag < 15 ? 1 : 2), addr(0), addr(6), utils.formatBytes32String('HAIAERO3')]); },
  };
  (axios.post as jest.Mock).mockImplementation(async (_url, body) => {
    const block = Number(BigInt(body.query.match(/hash:"(0x[0-9a-f]+)"/)[1]));
    return { data: { data: { _meta: { block: { number: block, hash: h(block) }, hasIndexingErrors: false }, safes: [{ id: 'safe-1', safeId: '1', safeHandler: addr(6), collateral: '10', owner: { address: addr(block < 15 ? 1 : 2) } }] } } };
  });
  return { config, client };
}
it('exports ownership-sensitive intervals from pinned snapshots and chain change blocks', async () => {
  const { config, client } = fixture();
  const r = await exportAeroInput(config, { cutover: 100, cumulative: {}, coveredReceipts: [] }, [], { '10': client as any });
  expect(r.input.windows.map(w => [w.start, w.end, w.positions[0].owner, w.positions[0].amount])).toEqual([
    [100, 150, addr(1), '10000000000000000000'], [150, 200, addr(2), '10000000000000000000'],
  ]);
});
it('does not export a partial indexer snapshot that omits collateral', async () => {
  const { config, client } = fixture();
  (axios.post as jest.Mock).mockImplementation(async (_url, body) => { const block = Number(BigInt(body.query.match(/hash:"(0x[0-9a-f]+)"/)[1])); return { data: { data: { _meta: { block: { number: block, hash: h(block) }, hasIndexingErrors: false }, safes: [] } } }; });
  await expect(exportAeroInput(config, { cutover: 100, cumulative: {}, coveredReceipts: [] }, [], { '10': client as any })).rejects.toThrow('omitted collateral');
});

it('rejects an undeployed eligible token rather than treating missing new collateral as zero', async () => {
  const { config, client } = fixture(); client.getCode = async () => '0x';
  await expect(exportAeroInput(config, { cutover: 100, cumulative: {}, coveredReceipts: [] }, [], { '10': client as any })).rejects.toThrow('not deployed');
});

it('starts newly deployed collateral only at its reviewed eligibility boundary', async () => {
  const { config, client } = fixture(); config.policy.sources.v.eligibleFrom = 150;
  client.getCode = async (_a?: string, block?: number) => block !== undefined && block < 15 ? '0x' : '0x6000';
  const result = await exportAeroInput(config, { cutover: 100, cumulative: {}, coveredReceipts: [] }, [], { '10': client as any });
  expect(result.input.windows.map(w => [w.start, w.end, w.positions.length])).toEqual([[100, 150, 0], [150, 200, 1]]);
});
