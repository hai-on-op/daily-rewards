import { Alchemy, AssetTransfersCategory, Network } from "alchemy-sdk";
import { providers } from "ethers";
import { getRewardTransferLogs } from "./rpc-logs";
import { config as appConfig } from "../../config"; // Import the config
import { AlchemyTransferTracker } from "../../infrastructure/transfers/AlchemyTransferTracker";
import { ITransferTracker } from "../../core/interfaces/ITransferTracker";

// Load config values
const {
  ALCHEMY_API_KEY,
  RPC_URL,
  DEPOSIT_CONTRACT_ADDRESS,
  DEPOSIT_SENDER_ADDRESS,
  KITE_ADDRESS,
  OP_ADDRESS,
  DINERO_ADDRESS,
  HAI_ADDRESS,
  REWARD_DISTRIBUTOR_ADDRESS
} = appConfig();

// Configure Alchemy SDK for Optimism
const alchemyConfig = {
  apiKey: ALCHEMY_API_KEY, // Use the config value
  network: Network.OPT_MAINNET, // or Network.OPT_SEPOLIA for testnet
};

const alchemy = new Alchemy(alchemyConfig);
const depositProvider = new providers.StaticJsonRpcProvider(RPC_URL);

// Token mapping for easier lookup
const TOKEN_MAP = {
  [KITE_ADDRESS.toLowerCase()]: 'KITE',
  [OP_ADDRESS.toLowerCase()]: 'OP',
  [DINERO_ADDRESS.toLowerCase()]: 'DINERO',
  [HAI_ADDRESS.toLowerCase()]: 'HAI',
};

export type TokenTransfer = {
  blockNumber: number;
  transactionHash: string;
  from: string;
  to: string;
  value: string;
  tokenAddress: string;
  tokenSymbol: string;
};

/**
 * Fetches ERC20 transfer events from a specific sender to the reward distributor contract.
 */
async function getTokenTransfersForSender(
  senderAddress: string,
  tokenAddresses: string[]
): Promise<TokenTransfer[]> {
  const contractAddress = REWARD_DISTRIBUTOR_ADDRESS;

  try {
    const allTransfers: TokenTransfer[] = [];

    for (const tokenAddress of tokenAddresses) {
      const logs = await getRewardTransferLogs(depositProvider, tokenAddress, senderAddress, contractAddress);

      // Process the logs for this token
      const transfers = logs.map((log) => {
        // Decode the value from the data field
        const value = BigInt(log.data);

        return {
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          from: `0x${log.topics[1].slice(26)}`, // Remove padding
          to: `0x${log.topics[2].slice(26)}`, // Remove padding
          value: value.toString(),
          tokenAddress: log.address,
          tokenSymbol: (TOKEN_MAP as any)[log.address.toLowerCase()] || 'UNKNOWN',
        };
      });

      allTransfers.push(...transfers);
    }

    // Sort all transfers by block number
    allTransfers.sort((a, b) => a.blockNumber - b.blockNumber);

    console.log(`Found ${allTransfers.length} total transfers across all tokens`);
    console.log('Transfers by token:',
      Object.entries(
        allTransfers.reduce((acc: Record<string, number>, t) => {
          acc[t.tokenSymbol] = (acc[t.tokenSymbol] || 0) + 1;
          return acc;
        }, {})
      )
    );

    return allTransfers;
  } catch (error) {
    // Provider errors may contain the authenticated endpoint URL.
    const code = (error as { code?: unknown }).code;
    throw new Error(`Reward deposit RPC failed (${typeof code === "string" && /^[A-Z_]+$/.test(code) ? code : "invalid scan or response"})`);
  }
}

export async function getTokenTransfersToContract(): Promise<TokenTransfer[]> {
  return getTokenTransfersForSender(
    DEPOSIT_SENDER_ADDRESS,
    [HAI_ADDRESS]
  );
}

export async function getHaiaeroTokenTransfersToContract(): Promise<TokenTransfer[]> {
  const cfg = appConfig();
  return getTokenTransfersForSender(
    cfg.HAIAERO_DEPOSIT_SENDER_ADDRESS,
    [cfg.HAIAERO_DEPOSIT_TOKEN_ADDRESS]
  );
}

// Alternative: Using Alchemy's asset transfers API (easier approach)
export async function getTokenTransfersUsingAssetAPI(): Promise<TokenTransfer[]> {
  const contractAddress = DEPOSIT_CONTRACT_ADDRESS;
  const senderAddress = DEPOSIT_SENDER_ADDRESS;
  const tokenAddresses = [KITE_ADDRESS, OP_ADDRESS, DINERO_ADDRESS, HAI_ADDRESS];

  try {
    // Get asset transfers for all tokens
    const response = await alchemy.core.getAssetTransfers({
      fromBlock: "0x0",
      toBlock: "latest",
      fromAddress: senderAddress,
      toAddress: contractAddress,
      contractAddresses: tokenAddresses,
      category: [AssetTransfersCategory.ERC20],
    });

    const transfers: TokenTransfer[] = response.transfers.map((transfer) => ({
      blockNumber: parseInt(transfer.blockNum, 16), // Convert hex string to number
      transactionHash: transfer.hash,
      from: transfer.from,
      to: transfer.to || "",
      value: transfer.value?.toString() || "0",
      tokenAddress: transfer.rawContract.address || "",
      tokenSymbol: (TOKEN_MAP as any)[transfer.rawContract.address?.toLowerCase() || ""] || transfer.asset || 'UNKNOWN',
    }));

    // Sort by block number
    transfers.sort((a, b) => a.blockNumber - b.blockNumber);

    console.log(`Found ${transfers.length} total transfers across all tokens`);
    console.log('Transfers by token:', 
      Object.entries(
        transfers.reduce((acc: Record<string, number>, t) => {
          acc[t.tokenSymbol] = (acc[t.tokenSymbol] || 0) + 1;
          return acc;
        }, {})
      )
    );

    return transfers;
  } catch (error) {
    console.error("Error fetching transfers:", error);
    throw error;
  }
}

/**
 * Create an ITransferTracker instance using Alchemy SDK
 */
export function createTransferTracker(): ITransferTracker {
  return new AlchemyTransferTracker(ALCHEMY_API_KEY);
}

// Usage

if (require.main === module) {
  async function main() {
    // Method 1: Using getLogs
    const transfersFromLogs = await getTokenTransfersToContract();
    console.log(
      "Transfers from logs:",
      transfersFromLogs.filter((t) => Number(t.value) >= 10 ** 18)
    );

    console.log(Number(transfersFromLogs[0].blockNumber), Number(transfersFromLogs[1].value))

    // Method 2: Using asset transfers API (recommended)
    const transfersFromAPI = await getTokenTransfersUsingAssetAPI();
  //  console.log("Transfers from API:", transfersFromAPI);
  }

  main();
}
