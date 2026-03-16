export interface TransactionResult {
  hash: string;
  blockNumber?: number;
  gasUsed?: string;
}

export interface IContractGateway {
  isPaused(): Promise<boolean>;
  getEpochCounter(): Promise<number>;
  pause(): Promise<TransactionResult>;
  unpause(): Promise<TransactionResult>;
  startInitialEpoch(): Promise<TransactionResult>;
  updateMerkleRoots(
    tokenAddresses: string[],
    roots: string[]
  ): Promise<TransactionResult>;
}
