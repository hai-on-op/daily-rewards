import { Alchemy, AssetTransfersCategory, Network, Utils } from "alchemy-sdk";
import { config as appConfig } from "../../config"; // Import the config

// Load config values
const {
  ALCHEMY_API_KEY,
  DEPOSIT_CONTRACT_ADDRESS,
  DEPOSIT_SENDER_ADDRESS,
  DEPOSIT_TOKEN_ADDRESS,
} = appConfig();

// Configure Alchemy SDK for Optimism
const alchemyConfig = {
  apiKey: ALCHEMY_API_KEY, // Use the config value
  network: Network.OPT_MAINNET, // or Network.OPT_SEPOLIA for testnet
};

const alchemy = new Alchemy(alchemyConfig);

export async function getTokenTransfersToContract() {
  // Your contract address that receives the tokens
  const contractAddress = DEPOSIT_CONTRACT_ADDRESS; // Use the config value

  // The address that sends the tokens
  const senderAddress = DEPOSIT_SENDER_ADDRESS; // Use the config value

  // The ERC20 token contract address
  const tokenAddress = DEPOSIT_TOKEN_ADDRESS; // Use the config value

  // ERC20 Transfer event signature
  // Transfer(address indexed from, address indexed to, uint256 value)
  const transferEventSignature = Utils.id("Transfer(address,address,uint256)");

  // Create filter parameters
  const filter = {
    address: tokenAddress,
    topics: [
      transferEventSignature,
      Utils.hexZeroPad(senderAddress, 32), // from address (indexed)
      Utils.hexZeroPad(contractAddress, 32), // to address (indexed)
    ],
    fromBlock: "earliest", // or specify a block number
    toBlock: "latest",
  };

  try {
    // Get all logs matching the filter
    const logs = await alchemy.core.getLogs(filter);

    // Process the logs
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
      };
    });

    console.log(`Found ${transfers.length} transfers`);
    return transfers;
  } catch (error) {
    console.error("Error fetching logs:", error);
    throw error;
  }
}

// Alternative: Using Alchemy's asset transfers API (easier approach)
export async function getTokenTransfersUsingAssetAPI() {
  const contractAddress = DEPOSIT_CONTRACT_ADDRESS; // Use the config value

  // The address that sends the tokens
  const senderAddress = DEPOSIT_SENDER_ADDRESS; // Use the config value

  // The ERC20 token contract address
  const tokenAddress = DEPOSIT_TOKEN_ADDRESS; // Use the config value

  try {
    // Get asset transfers
    const response = await alchemy.core.getAssetTransfers({
      fromBlock: "0x0",
      toBlock: "latest",
      fromAddress: senderAddress,
      toAddress: contractAddress,
      contractAddresses: [tokenAddress],
      category: [AssetTransfersCategory.ERC20],
    });

    const transfers = response.transfers.map((transfer) => ({
      blockNumber: transfer.blockNum,
      hash: transfer.hash,
      from: transfer.from,
      to: transfer.to,
      value: transfer.value,
      asset: transfer.asset,
      tokenAddress: transfer.rawContract.address,
    }));

    console.log(`Found ${transfers.length} transfers`);
    return transfers;
  } catch (error) {
    console.error("Error fetching transfers:", error);
    throw error;
  }
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
