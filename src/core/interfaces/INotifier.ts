export interface TransactionNotification {
  type: "initiate" | "success" | "failure";
  operation: string;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  details?: any;
}

export interface INotifier {
  notifyTransaction(notification: TransactionNotification): Promise<void>;
  notifyMerkleUpdate(tokens: string[], roots: string[]): Promise<void>;
}
