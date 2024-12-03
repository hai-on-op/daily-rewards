import { GoldRushClient, Transaction, Chain } from '@covalenthq/client-sdk';
import { TransactionCache } from './transactionCache';
import path from 'path';

export const createCovalentFetcher = (
  apiKey: string,
  chainId: Chain,
  projectRoot: string = path.resolve(__dirname, '../../../..')
) => {
  const cache = new TransactionCache(projectRoot);
  let initialized = false;

  return async (walletAddress: string) => {
    console.log(`Starting to fetch transactions for wallet: ${walletAddress}`);
    
    if (!initialized) {
      await cache.init();
      initialized = true;
    }

    // Try to get cached transactions
    const cachedTransactions = await cache.getTransactions(walletAddress);
    if (cachedTransactions.length > 0) {
      console.log(`Found ${cachedTransactions.length} cached transactions for ${walletAddress}`);
    }

    //return cachedTransactions;


    // Fetch transactions from Covalent
   const client = new GoldRushClient(apiKey);
    let allTransactions: Transaction[] = [];
    let pageNumber = 0;
    let hasNextPage = true;
    const MAX_PAGES = 100;

    // Always fetch first page
    console.log("Fetching first page of transactions...");
    const firstPageResp = await client.TransactionService.getTransactionsForAddressV3(
      chainId,
      walletAddress,
      pageNumber
    );

    if (firstPageResp.data?.items) {
      allTransactions = firstPageResp.data.items;
      hasNextPage = firstPageResp.data.links?.next !== null;

      // If we have cached transactions and find any of them in the first page,
      // we can merge with cache and stop fetching
      if (cachedTransactions.length > 0 && 
          await cache.hasAnyCachedTransaction(walletAddress, allTransactions)) {
        console.log("Found cached transaction in first page, merging with cache");
        return cache.mergeTransactions(walletAddress, cachedTransactions, allTransactions);
      }

      // If we don't find any cached transactions in first page,
      // we need to fetch all pages as we might have missed some
      pageNumber++;
      while (hasNextPage && pageNumber < MAX_PAGES) {
        try {
          console.log(`Fetching page ${pageNumber}...`);
          const resp = await client.TransactionService.getTransactionsForAddressV3(
            chainId,
            walletAddress,
            pageNumber
          );

          if (resp.data?.items) {
            allTransactions = allTransactions.concat(resp.data.items);
            console.log(`Fetched ${resp.data.items.length} transactions from page ${pageNumber}`);
          }

          hasNextPage = resp.data?.links?.next !== null;
          pageNumber++;

          if (resp.error) {
            console.error(`Error fetching page ${pageNumber}:`, resp.error_message);
            break;
          }
        } catch (error) {
          console.error(`Error fetching page ${pageNumber}:`, error);
          break;
        }
      }
    }

    // Update cache with all transactions
    await cache.updateTransactions(walletAddress, allTransactions);
    console.log(`Cached ${allTransactions.length} transactions for ${walletAddress}`);
    
    return allTransactions;
  };
};

export const filterTransactionsByBlockRange = (
  transactions: Transaction[],
  fromBlock: number = 0,
  toBlock: number | null = null
): Transaction[] => {
  return transactions.filter((tx) => {
    const blockHeight = tx.block_height;
    if (blockHeight === undefined || blockHeight === null) return false;
    if (blockHeight < fromBlock) return false;
    if (toBlock !== null && blockHeight > toBlock) return false;
    return true;
  });
};


