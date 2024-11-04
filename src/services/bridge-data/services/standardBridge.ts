import { BigNumber } from "ethers";
import { LogEvent, Transaction } from "@covalenthq/client-sdk";

import {
  CategorizedStandardBridgeEvents,
  StandardBridgeEvent,
  TotalBridgedAmount,
} from "../types";

import {
  extractLogEvents,
  filterLogEventsBySenderAddresses,
} from "../utils/eventsProcessing";

export const mapEventsOfStandardBridge = (events: LogEvent[]) =>
  events.map((event) => ({
    blockHeight: event.block_height,
    name: event.decoded?.name,
    from: event.decoded?.params.find((p) => p.name === "from")?.value,
    to: event.decoded?.params.find((p) => p.name === "to")?.value,
    amount: event.decoded?.params.find((p) => p.name === "amount")?.value,
    extraData: event.decoded?.params.find((p) => p.name === "extraData")?.value,
    localToken: event.decoded?.params.find((p) => p.name === "localToken")
      ?.value,
    remoteToken: event.decoded?.params.find((p) => p.name === "remoteToken")
      ?.value,
  }));

export const categorizeStandardBridgeEvents = (
  events: StandardBridgeEvent[]
): CategorizedStandardBridgeEvents => {
  return events.reduce(
    (acc: CategorizedStandardBridgeEvents, event) => {
      if (event.name === "ETHBridgeFinalized") {
        if (!acc.eth) acc.eth = [];
        acc.eth.push(event);
      } else if (event.name === "ERC20BridgeFinalized" && event.localToken) {
        if (!acc[event.localToken]) acc[event.localToken] = [];
        acc[event.localToken].push(event);
      }
      return acc;
    },
    { eth: [] }
  );
};

export const getTotalStandarBridgedAmount = (
  categorizedEvents: CategorizedStandardBridgeEvents
): TotalBridgedAmount => {
  return Object.entries(categorizedEvents).reduce(
    (acc: TotalBridgedAmount, [key, events]) => {
      acc[key] = events.reduce((sum, event) => {
        return sum.add(BigNumber.from(event.amount));
      }, BigNumber.from(0));
      return acc;
    },
    { eth: BigNumber.from(0) }
  );
};

export const processStandardBridgeEvents =
  (walletTransactions: Transaction[]) => async (filterAddresses: string[]) => {
    const logEvents = extractLogEvents(walletTransactions);

    const filteredEvents =
      filterLogEventsBySenderAddresses(filterAddresses)(logEvents);

    const mappedEvents = mapEventsOfStandardBridge(filteredEvents);

    return mappedEvents;
  };
