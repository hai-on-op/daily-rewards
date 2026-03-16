import { INotifier, TransactionNotification } from "../../core/interfaces/INotifier";

export class NullNotifier implements INotifier {
  async notifyTransaction(_notification: TransactionNotification): Promise<void> {}
  async notifyMerkleUpdate(_tokens: string[], _roots: string[]): Promise<void> {}
}
