import { utils } from 'ethers';
import { RpcEvidenceVerifier } from './evidence';
import { AeroPolicy, RevenueBatch } from './types';
const hash = '0x' + '11'.repeat(32), addr = (n: number) => '0x' + n.toString(16).padStart(40, '0');
const policy: AeroPolicy = { version: 1, cutover: 100, boost: { mode: 'none', maxBps: 10000 }, sources: {},
  payoutTokens: { HAI: { chainId: 10, address: addr(4), decimals: 18 } }, collectors: { '10': { recipient: addr(3), senders: [addr(1)] } } };
const batch: RevenueBatch = { chainId: 10, transactionHash: hash, logIndex: 2, blockNumber: 12, blockHash: hash,
  token: 'HAI', sender: addr(1), amount: '100', accountingReference: 'accounting', slices: [{ start: 100, end: 200, amount: '100', regime: 'unified' }] };
const i = new utils.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const log = i.encodeEventLog(i.getEvent('Transfer'), [addr(1), addr(3), '100']);
function client() {
  return { _isProvider: true, getNetwork: jest.fn(async () => ({ chainId: 10 })),
    getBlock: jest.fn(async (b) => ({ number: b === 'finalized' ? 20 : b, timestamp: 201, hash })),
    getTransactionReceipt: jest.fn(async () => ({ status: 1, transactionHash: hash, blockNumber: 12, blockHash: hash,
      logs: [{ ...log, logIndex: 2, address: addr(4) }] })),
    resolveName: jest.fn(async (a) => a), call: jest.fn(async () => utils.defaultAbiCoder.encode(['uint8'], [18])),
  };
}
describe('finalized revenue proof', () => {
  it('accepts an exact finalized ERC20 transfer', async () => { await expect(new RpcEvidenceVerifier({ '10': client() as any }).verifyReceipt(batch, policy)).resolves.toBeUndefined(); });
  it('rejects an unfinalized block, reorg, payout before earnings end, and wrong RPC chain', async () => {
    let c = client(); c.getBlock.mockImplementation(async b => ({ number: b === 'finalized' ? 11 : b, timestamp: 201, hash }));
    await expect(new RpcEvidenceVerifier({ '10': c as any }).verifyReceipt(batch, policy)).rejects.toThrow('not finalized');
    c = client(); await expect(new RpcEvidenceVerifier({ '10': c as any }).verifyReceipt({ ...batch, blockHash: '0x' + '22'.repeat(32) }, policy)).rejects.toThrow('Noncanonical');
    c = client(); c.getBlock.mockImplementation(async b => ({ number: b === 'finalized' ? 20 : b, timestamp: 199, hash }));
    await expect(new RpcEvidenceVerifier({ '10': c as any }).verifyReceipt(batch, policy)).rejects.toThrow('complete earning');
    c = client(); c.getNetwork.mockResolvedValue({ chainId: 8453 }); await expect(new RpcEvidenceVerifier({ '10': c as any }).verifyReceipt(batch, policy)).rejects.toThrow('wrong RPC');
  });
  it('rejects wrong amount, sender and exact log identity', async () => {
    for (const delta of [{ amount: '99' }, { sender: addr(8) }, { logIndex: 1 }]) {
      await expect(new RpcEvidenceVerifier({ '10': client() as any }).verifyReceipt({ ...batch, ...delta }, policy)).rejects.toThrow();
    }
  });
});
