export interface TokenTransfer {
  blockNumber: number;
  transactionHash: string;
  from: string;
  to: string;
  value: string;
  tokenAddress: string;
  tokenSymbol: string;
}

export interface ITransferTracker {
  getTransfers(
    senderAddress: string,
    recipientAddress: string,
    tokenAddresses: string[],
    tokenSymbolMap: Record<string, string>
  ): Promise<TokenTransfer[]>;
}
