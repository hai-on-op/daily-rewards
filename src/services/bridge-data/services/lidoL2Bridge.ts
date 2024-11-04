import { LogEvent, Transaction } from "@covalenthq/client-sdk";
import { BigNumber } from "ethers";

import { LidoWstETHTransferEvent } from "../types";
import { extractLogEvents } from "../utils/eventsProcessing";
import { WSTETH_CONTRACT_ADDRESS } from "../constants";

export const filterLidoWstETHTransfers = (
  events: LogEvent[],
  walletAddress: string
): LogEvent[] => {
  return events.filter(
    (event) =>
      event.sender_address?.toLowerCase() === WSTETH_CONTRACT_ADDRESS.toLowerCase() &&
      event.decoded?.name === "Transfer" &&
      event.decoded.params.find(
        (p) =>
          p.name === "to" &&
          p.value.toLowerCase() === walletAddress.toLowerCase()
      ) &&
      event.decoded.params.find(
        (p) =>
          p.name === "from" &&
          p.value.toLowerCase() === "0x0000000000000000000000000000000000000000"
      )
  );
};

export const mapLidoWstETHTransfers = (
  events: LogEvent[]
): LidoWstETHTransferEvent[] => {
  return events.map((event) => ({
    blockHeight: event.block_height,
    from: event.decoded?.params.find((p) => p.name === "from")?.value || "",
    to: event.decoded?.params.find((p) => p.name === "to")?.value || "",
    amount: event.decoded?.params.find((p) => p.name === "value")?.value || "0",
  }));
};

export const getTotalLidoWstETHBridgedAmount = (
  events: LidoWstETHTransferEvent[]
): BigNumber => {
  return events.reduce((sum, event) => {
    return sum.add(BigNumber.from(event.amount));
  }, BigNumber.from(0));
};

export const processLidoWstETHEvents =
  (walletTransactions: Transaction[]) =>
  async (
    walletAddress: string,
    crossDomainMessengerAddress: string
  ) => {
    const crossDomainTransactions = walletTransactions.filter(
      (tx) =>
        tx.from_address?.toLowerCase() ===
        crossDomainMessengerAddress.toLowerCase()
    );

    console.log(crossDomainTransactions, "crossDomainTransactions", crossDomainTransactions.length);

    const logEvents = extractLogEvents(crossDomainTransactions);

    const lidoWstETHTransfers = filterLidoWstETHTransfers(
      logEvents,
      walletAddress
    );

    const mappedEvents = mapLidoWstETHTransfers(lidoWstETHTransfers);

    return mappedEvents;
  };