import { Contract, providers, utils } from 'ethers';
import { address, amount, hash32, integer } from './ledger';
import { AeroPolicy, Anchor, EvidenceVerifier, RevenueBatch } from './types';
const transfer = new utils.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
/** Read-only RPC checks. Confirmation counts alone are insufficient: require the finalized tag. */
export class RpcEvidenceVerifier implements EvidenceVerifier {
  private finalized = new Map<number, providers.Block>();
  constructor(private readonly clients: Record<string, providers.Provider>) {}
  private async client(chainId: number): Promise<providers.Provider> {
    const p = this.clients[String(chainId)];
    if (!p || (await p.getNetwork()).chainId !== chainId) throw new Error(`Missing/wrong RPC chain ${chainId}`);
    return p;
  }
  async verifyAnchor(a: Anchor, throughTimestamp = 0): Promise<void> {
    integer(a.chainId); integer(a.blockNumber); hash32(a.blockHash);
    const p = await this.client(a.chainId);
    let f = this.finalized.get(a.chainId);
    if (!f) { f = await p.getBlock('finalized'); if (!f) throw new Error('RPC does not provide finalized block'); this.finalized.set(a.chainId, f); }
    if (a.blockNumber > f.number) throw new Error('Evidence is not finalized');
    const b = await p.getBlock(a.blockNumber);
    if (!b || b.hash.toLowerCase() !== a.blockHash.toLowerCase()) throw new Error('Noncanonical evidence block');
    if (b.timestamp < throughTimestamp) throw new Error('Evidence does not cover complete earning interval');
  }
  async verifyReceipt(b: RevenueBatch, policy: AeroPolicy): Promise<void> {
    await this.verifyAnchor(b, Math.max(...b.slices.map(s => s.end)));
    const p = await this.client(b.chainId), receipt = await p.getTransactionReceipt(b.transactionHash);
    if (!receipt || receipt.status !== 1 || receipt.transactionHash.toLowerCase() !== b.transactionHash.toLowerCase() ||
        receipt.blockNumber !== b.blockNumber || receipt.blockHash.toLowerCase() !== b.blockHash.toLowerCase()) throw new Error('Receipt missing, reverted, or reorged');
    const token = policy.payoutTokens[b.token], collector = policy.collectors[String(b.chainId)];
    const l = receipt.logs.find(l => l.logIndex === b.logIndex);
    if (!l || l.address.toLowerCase() !== address(token.address)) throw new Error('Missing exact funded token transfer log');
    let decoded: utils.LogDescription;
    try { decoded = transfer.parseLog(l); } catch { throw new Error('Revenue log is not an ERC20 Transfer'); }
    if (address(decoded.args.from) !== address(b.sender) || !collector.senders.map(address).includes(address(b.sender)) ||
        address(decoded.args.to) !== address(collector.recipient) || amount(decoded.args.value.toString()) !== amount(b.amount)) throw new Error('Revenue transfer recipient/sender/amount mismatch');
    const decimals: number = await new Contract(token.address, ['function decimals() view returns(uint8)'], p).decimals({ blockTag: b.blockNumber });
    if (decimals !== token.decimals) throw new Error('Payout token decimals mismatch');
  }
}
