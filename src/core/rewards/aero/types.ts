/** All amounts are unsigned base-unit decimal strings; intervals are [start,end). */
export type ExactRewards = Record<string, { address: string; earned: string }[]>;
export type Asset = 'legacy-velo' | 'legacy-aero' | 'new-aero';
export type Regime = 'legacy-velo' | 'legacy-aero' | 'unified';
export interface Anchor { chainId: number; blockNumber: number; blockHash: string }
export interface Position {
  id: string;
  source: string;
  owner: string;
  amount: string;
  /** LP balances use the eligible hai-token reserve only, never both pool legs. */
  lp?: { eligibleReserve: string; totalSupply: string };
}
export interface PositionWindow {
  start: number;
  end: number;
  anchors: Anchor[];
  positions: Position[];
  skite: Record<string, string>;
}
export interface RevenueBatch {
  chainId: number;
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  token: string;
  sender: string;
  amount: string;
  /** Reviewed source accounting reference; payout time does not define earnings. */
  accountingReference: string;
  slices: { start: number; end: number; amount: string; regime: Regime }[];
}
export interface AeroPolicy {
  version: 1;
  cutover: number;
  boost: { mode: 'none' | 'skite-share'; maxBps: number };
  sources: Record<string, { chainId: number; contract: string; eligibleToken: string; asset: Asset; kind: 'vault' | 'lp'; collateralType?: string; eligibleFrom?: number; eligibleUntil?: number }>;
  payoutTokens: Record<string, { chainId: number; address: string; decimals: number }>;
  collectors: Record<string, { recipient: string; senders: string[] }>;
}
export interface LegacySnapshot {
  /** Cumulative earned, BEFORE any claim subtraction or incident adjustments. */
  cumulative: ExactRewards;
  /** Every transfer already included in this frozen snapshot, chain:tx:log. */
  coveredReceipts: string[];
  cutover: number;
}
export interface AeroInput {
  policy: AeroPolicy;
  baseline: LegacySnapshot;
  windows: PositionWindow[];
  batches: RevenueBatch[];
  previous?: AeroLedger;
}
export interface AeroLedger {
  version: 1;
  policyHash: string;
  baselineHash: string;
  /** Immutable earning-input digest per receipt, including its position windows. */
  receipts: Record<string, string>;
  cumulative: ExactRewards;
  allocated: Record<string, string>;
}
export interface EvidenceVerifier {
  verifyAnchor(anchor: Anchor, throughTimestamp?: number): Promise<void>;
  verifyReceipt(batch: RevenueBatch, policy: AeroPolicy): Promise<void>;
}
export interface AeroFileConfig {
  enabled: true;
  inputFile: string;
  inputSha256: string;
  /** Required for continued runs; use null ONLY for the first reviewed ledger. */
  previousLedger: { file: string; sha256: string } | null;
  rpcUrls: Record<string, string>;
}
