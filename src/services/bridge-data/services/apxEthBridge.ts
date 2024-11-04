import { LogEvent, Transaction } from "@covalenthq/client-sdk";
import { BigNumber } from "ethers";

import { ApxETHTransferEvent } from "../types";
import { extractLogEvents } from "../utils/eventsProcessing";

export const filterApxETHTransfers = (
  events: LogEvent[],
  apxETHAddress: string,
  walletAddress: string
): LogEvent[] => {
  return events.filter((event) => {
    return (
      event.sender_address?.toLowerCase() === apxETHAddress.toLowerCase() &&
      event.decoded?.name === "Transfer" &&
      event.decoded.params.find(
        (p) =>
          p.name === "to" &&
          p.value.toLowerCase() === walletAddress.toLowerCase()
      )
    );
  });
};

export const mapApxETHTransfers = (
  events: LogEvent[]
): ApxETHTransferEvent[] => {
  return events.map((event) => ({
    blockHeight: event.block_height,
    from: event.decoded?.params.find((p) => p.name === "from")?.value || "",
    to: event.decoded?.params.find((p) => p.name === "to")?.value || "",
    amount: event.decoded?.params.find((p) => p.name === "value")?.value || "0",
  }));
};

export const getTotalApxETHBridgedAmount = (
  events: ApxETHTransferEvent[]
): BigNumber => {
  return events.reduce((sum, event) => {
    return sum.add(BigNumber.from(event.amount));
  }, BigNumber.from(0));
};

export const processApxETHEvents =
  (walletTransactions: Transaction[]) =>
  async (
    walletAddress: string,
    apxETHAddress: string,
    lzExecutorAddress: string
  ) => {
    const layerZeroTransactions = walletTransactions.filter(
      (tx) => tx.from_address?.toLowerCase() === lzExecutorAddress
    );

    const logEvents = extractLogEvents(layerZeroTransactions);

    const apxETHTransfers = filterApxETHTransfers(
      logEvents,
      apxETHAddress,
      walletAddress
    );

    const mappedEvents = mapApxETHTransfers(apxETHTransfers);

    return mappedEvents;
  };
