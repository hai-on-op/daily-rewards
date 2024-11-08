import fs from "fs/promises";
import path from "path";
import { Transaction, LogEvent } from "@covalenthq/client-sdk";

interface CachedTransactions {
  transactions: SimplifiedTransaction[];
  lastUpdated: number;
}

// Simplified structure that stores everything as strings
interface SimplifiedTransaction {
  tx_hash: string;
  block_height: number;
  from_address: string;
  to_address: string | null;
  value: string;
  successful: boolean;
  timestamp: string;
  // Store raw log events as they come
  raw_log_events: any[];
  to_address_label: string | null;
  from_address_label: string | null;
  gas_spent: number | null;
  gas_price: string | null;
}

export class TransactionCache {
  private cacheDir: string;
  private cache: Map<string, CachedTransactions> = new Map();

  constructor(projectRoot: string) {
    this.cacheDir = path.join(projectRoot, "transactions-cache");
  }

  private getFilePath(address: string): string {
    return path.join(this.cacheDir, `${address.toLowerCase()}.json`);
  }

  async init(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      console.log(`Cache directory initialized at: ${this.cacheDir}`);
    } catch (error) {
      console.error("Error creating cache directory:", error);
      throw error;
    }
  }

  private async loadAddressCache(
    address: string
  ): Promise<CachedTransactions | null> {
    const filePath = this.getFilePath(address);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Error loading cache for ${address}:`, error);
      }
      return null;
    }
  }

  private async saveAddressCache(
    address: string,
    data: CachedTransactions
  ): Promise<void> {
    const filePath = this.getFilePath(address);
    try {
      const output =
        `{
        "lastUpdated": ${data.lastUpdated},
        "transactions": ` +
        // Add the transactions array directly as a string
        "[" +
        data.transactions.map((tx) => JSON.stringify(tx)).join(",") +
        "]" +
        "}";

      await fs.writeFile(filePath, output);
      console.log(`Cache saved for address: ${address}`);
    } catch (error) {
      console.error(`Error saving cache for ${address}:`, error);
      throw error;
    }
  }

  private simplifyTransaction(tx: Transaction): SimplifiedTransaction | null {
    if (
      !tx.tx_hash ||
      !tx.block_height ||
      !tx.from_address ||
      tx.successful === null ||
      !tx.block_signed_at
    ) {
      return null;
    }

    return {
      tx_hash: tx.tx_hash,
      block_height: tx.block_height,
      from_address: tx.from_address,
      to_address: tx.to_address,
      value: tx.value?.toString() || "0",
      successful: tx.successful,
      timestamp: tx.block_signed_at.toISOString(),
      // Store raw log events
      raw_log_events: tx.log_events || [],
      to_address_label: tx.to_address_label,
      from_address_label: tx.from_address_label,
      gas_spent: tx.gas_spent,
      gas_price: tx.gas_price?.toString() || null,
    };
  }

  public findNewTransactions(
    existingTxs: Transaction[],
    newTxs: Transaction[]
  ): Transaction[] {
    const existingTxHashes = new Set(
      existingTxs
        .map((tx) => tx.tx_hash)
        .filter((hash): hash is string => !!hash)
    );
    return newTxs.filter(
      (tx) => tx.tx_hash && !existingTxHashes.has(tx.tx_hash)
    );
  }

  async getTransactions(address: string): Promise<Transaction[]> {
    const cached = await this.loadAddressCache(address);
    if (!cached) return [];

    return cached.transactions.map((tx) => {
      const transaction: Partial<Transaction> = {
        tx_hash: tx.tx_hash,
        block_height: tx.block_height,
        from_address: tx.from_address,
        to_address: tx.to_address,
        value: BigInt(tx.value),
        successful: tx.successful,
        block_signed_at: new Date(tx.timestamp),
        log_events: tx.raw_log_events,
        to_address_label: tx.to_address_label,
        from_address_label: tx.from_address_label,
        gas_spent: tx.gas_spent,
      };
      return transaction as Transaction;
    });
  }

  async updateTransactions(
    address: string,
    transactions: Transaction[]
  ): Promise<void> {
    const simplified = transactions
      .map((tx) => this.simplifyTransaction(tx))
      .filter((tx): tx is SimplifiedTransaction => tx !== null);

    const cacheData: CachedTransactions = {
      transactions: simplified,
      lastUpdated: Date.now(),
    };

    await this.saveAddressCache(address, cacheData);
  }

  async hasAnyCachedTransaction(
    address: string,
    newTransactions: Transaction[]
  ): Promise<boolean> {
    const cached = await this.loadAddressCache(address);
    if (!cached || cached.transactions.length === 0) return false;

    const cachedTxHashes = new Set(cached.transactions.map((tx) => tx.tx_hash));
    return newTransactions.some(
      (tx) => tx.tx_hash && cachedTxHashes.has(tx.tx_hash)
    );
  }

  public async mergeTransactions(
    address: string,
    existingTxs: Transaction[],
    newTxs: Transaction[]
  ): Promise<Transaction[]> {
    const uniqueNewTxs = this.findNewTransactions(existingTxs, newTxs);
    await this.updateTransactions(address, [...uniqueNewTxs, ...existingTxs]);
    return this.getTransactions(address);
  }

  public async listCachedAddresses(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.cacheDir);
      return files
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.replace(".json", ""));
    } catch (error) {
      console.error("Error listing cached addresses:", error);
      return [];
    }
  }
}
