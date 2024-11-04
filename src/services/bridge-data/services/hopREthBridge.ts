import { LogEvent, Transaction } from "@covalenthq/client-sdk";
import { BigNumber } from "ethers";

import { HopRETHTransferEvent } from "../types";
import { extractLogEvents } from "../utils/eventsProcessing";
import { HOP_PROTOCOL_RETH_WRAPPER } from "../constants";

export const filterHopRETHTransfers = (
  events: LogEvent[],
  rethContractAddress: string,
  walletAddress: string
): LogEvent[] => {
  return events.filter(
    (event) =>
      event.sender_address?.toLowerCase() ===
        rethContractAddress.toLowerCase() &&
      event.decoded?.name === "Transfer" &&
      event.decoded.params.find(
        (p) =>
          p.name === "to" &&
          p.value.toLowerCase() === walletAddress.toLowerCase()
      ) &&
      event.decoded.params.find(
        (p) =>
          p.name === "from" &&
          p.value.toLowerCase() === HOP_PROTOCOL_RETH_WRAPPER.toLowerCase()
      )
  );
};

export const mapHopRETHTransfers = (
  events: LogEvent[]
): HopRETHTransferEvent[] => {
  return events.map((event) => ({
    from: event.decoded?.params.find((p) => p.name === "from")?.value || "",
    to: event.decoded?.params.find((p) => p.name === "to")?.value || "",
    amount: event.decoded?.params.find((p) => p.name === "value")?.value || "0",
    blockHeight: event.block_height,
  }));
};

export const getTotalHopRETHBridgedAmount = (
  events: HopRETHTransferEvent[]
): BigNumber => {
  return events.reduce((sum, event) => {
    return sum.add(BigNumber.from(event.amount));
  }, BigNumber.from(0));
};

export const processHopRETHEvents =
  (walletTransactions: Transaction[]) =>
  async (
    walletAddress: string,
    crossDomainMessengerAddress: string,
    rethContractAddress: string
  ) => {
    const crossDomainTransactions = walletTransactions.filter(
      (tx) =>
        tx.from_address?.toLowerCase() ===
        crossDomainMessengerAddress.toLowerCase()
    );

    console.log(
      crossDomainTransactions,
      "crossDomainTransactions",
      crossDomainTransactions.length
    );

    const logEvents = extractLogEvents(crossDomainTransactions);

    const hopRETHTransfers = filterHopRETHTransfers(
      logEvents,
      rethContractAddress,
      walletAddress
    );

    const mappedEvents = mapHopRETHTransfers(hopRETHTransfers);

    return mappedEvents;
  };
