export type RootUpdateStatus =
  | "running"
  | "generated"
  | "backed_up"
  | "updated_on_chain"
  | "verified"
  | "needs_upload_repair"
  | "failed";

export interface TokenRootMetadata {
  tokenAddress?: string;
  root?: string;
  onChainRoot?: string;
  onChainVerified?: boolean;
  backupFile?: string;
  backupVerified?: boolean;
  backupError?: string;
  cloudflareUploaded?: boolean;
  cloudflareError?: string;
}

export interface RootUpdateManifest {
  version: 1;
  runId: string;
  status: RootUpdateStatus;
  startedAt: string;
  completedAt?: string;
  gitCommit?: string;
  featureMode: string;
  adjustmentFilePath?: string;
  adjustmentFileHash?: string;
  entryCounterBefore?: number;
  effectiveEntryCounter?: number;
  entryCounterAfter?: number;
  blockNumbers?: {
    lp: number;
    minter: number;
    haivelo: number;
  };
  updateTxHash?: string;
  updateBlock?: number;
  unpauseTxHash?: string;
  unpausedAt?: string;
  errors: string[];
  tokens: Record<string, TokenRootMetadata>;
  verification?: {
    checkedAt: string;
    ok: boolean;
    errors: string[];
  };
}

export interface UnpauseManifest {
  version: 1;
  rootUpdateRunId?: string;
  txHash: string;
  blockNumber?: number;
  completedAt: string;
  epochCounter: string;
  paused: boolean;
}

export interface UnpauseVerificationResult {
  ok: boolean;
  errors: string[];
  manifest?: RootUpdateManifest;
  contractState?: {
    paused: boolean;
    epochCounter: string;
  };
}
