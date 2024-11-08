import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

import {
  createCovalentFetcher,
  filterTransactionsByBlockRange,
} from "./services/transactionService";
import {
  processStandardBridgeEvents,
  categorizeStandardBridgeEvents,
} from "./services/standardBridge";
import { processApxETHEvents } from "./services/apxEthBridge";
import { processHopRETHEvents } from "./services/hopREthBridge";
import { processLidoWstETHEvents } from "./services/lidoL2Bridge"; // Add this import
import { calculateTotalBridgedAmounts } from "./services/bridgeCalculations";

import { StandardBridgeEvent } from "./types";
import { BridgedAmounts } from "./types";

import {
  API_KEY,
  CHAIN_ID,
  STANDARD_BRIDGE_ADDRESS,
  LZ_EXECUTOR_ADDRESS,
  CROSS_DOMAIN_MESSENGER_ADDRESS,
  APX_ETH_ADDRESS,
  RETH_CONTRACT_ADDRESS,
  WSTETH_CONTRACT_ADDRESS,
} from "./constants";

const getBridgedAmounts = async (
  walletAddress: string,
  fromBlock: number,
  toBlock: number
) => {
  const fetcher = createCovalentFetcher(API_KEY, CHAIN_ID);
  const transactions = await fetcher(walletAddress);

  const filteredTransactions = filterTransactionsByBlockRange(
    transactions,
    fromBlock,
    toBlock
  );

  // Process Standard Bridge events
  const standardBridgeEvents = await processStandardBridgeEvents(
    filteredTransactions
  )([STANDARD_BRIDGE_ADDRESS]);
  const categorizedStandardBridgeEvents = categorizeStandardBridgeEvents(
    standardBridgeEvents as StandardBridgeEvent[]
  );

  // Process apxETH events
  const apxETHEvents = await processApxETHEvents(filteredTransactions)(
    walletAddress,
    APX_ETH_ADDRESS,
    LZ_EXECUTOR_ADDRESS
  );

  // Process Hop rETH events
  const hopRETHEvents = await processHopRETHEvents(filteredTransactions)(
    walletAddress,
    CROSS_DOMAIN_MESSENGER_ADDRESS,
    RETH_CONTRACT_ADDRESS
  );

  // Add Lido wstETH events processing
  const lidoWstETHEvents = await processLidoWstETHEvents(filteredTransactions)(
    walletAddress,
    CROSS_DOMAIN_MESSENGER_ADDRESS
  );

  console.log(
    categorizedStandardBridgeEvents,
    "categorizedStandardBridgeEvents"
  );

  const bridgeTransactions = [
    ...Object.entries(categorizedStandardBridgeEvents).flatMap(
      ([token, events]) => {
        const getTokenNameOrAddress = (token: string) => {
          switch (token.toLowerCase()) {
            case RETH_CONTRACT_ADDRESS.toLowerCase():
              return "RETH";
            case APX_ETH_ADDRESS.toLowerCase():
              return "APXETH";
            case WSTETH_CONTRACT_ADDRESS.toLowerCase():
              return "WSTETH";
            default:
              return token;
          }
        };

        return events.map((event) => ({
          bridgeName: "Standard Bridge",
          token:
            token === "eth"
              ? "ETH"
              : getTokenNameOrAddress(event.localToken || token),
          amount: event.amount,
          // @ts-ignore
          blockHeight: event.blockHeight,
        }));
      }
    ),
    ...apxETHEvents.map((event) => ({
      bridgeName: "apxETH Bridge",
      token: "apxETH",
      amount: event.amount,
      blockHeight: event.blockHeight,
    })),
    ...hopRETHEvents.map((event) => ({
      bridgeName: "Hop Bridge",
      token: "rETH",
      amount: event.amount,
      blockHeight: event.blockHeight,
    })),
    ...lidoWstETHEvents.map((event) => ({
      bridgeName: "Lido Bridge",
      token: "wstETH",
      amount: event.amount,
      blockHeight: event.blockHeight,
    })),
  ];

  return {
    bridgeTransactions,
    totalAmounts: calculateTotalBridgedAmounts(
      walletAddress,
      categorizedStandardBridgeEvents,
      apxETHEvents,
      hopRETHEvents,
      lidoWstETHEvents,
      WSTETH_CONTRACT_ADDRESS,
      RETH_CONTRACT_ADDRESS,
      APX_ETH_ADDRESS
    ),
  };
};

const getBridgedAmountsForAddresses = async (
  walletAddresses: string[],
  fromBlock: number,
  toBlock: number
) => {
  const results = [];
  for (const address of walletAddresses) {
    try {
      console.log(`Processing address: ${address}`);
      const { bridgeTransactions } = await getBridgedAmounts(
        address,
        fromBlock,
        toBlock
      );

      console.log(bridgeTransactions, "bridgeTransactions");
      results.push({ address, bridgeTransactions });
      console.log(`Finished processing address: ${address}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error processing address ${address}:`, error);
      results.push({ address, error: "Failed to process" });
    }
  }
  return results;
};

interface Addresses {
  APXETH: string[];
  RETH: string[];
  WSTETH: string[];
}

export const getBridgeData = async (
  { fromBlock, toBlock }: { fromBlock: number; toBlock: number },
  addresses?: Addresses,
  addressesArray?: string[]
) => {
  console.log("Unique addresses for each coin:");
  console.log(JSON.stringify(addresses, null, 2));

  // Combine all addresses for processing
  // Combine all addresses for processing
  const allAddresses = addresses
    ? [
        ...new Set([
          ...addresses.APXETH,
          ...addresses.RETH,
          ...addresses.WSTETH,
        ]),
      ]
    : addressesArray
    ? addressesArray
    : [];

  console.log(`Total unique addresses: ${allAddresses.length}`);
  console.log(
    `Filtering transactions from block ${fromBlock} to ${toBlock || "latest"}`
  );
  console.log("Starting to process addresses...");
  const bridgedAmountsForAddresses = await getBridgedAmountsForAddresses(
    allAddresses,
    fromBlock,
    toBlock
  );

  return bridgedAmountsForAddresses;
};
