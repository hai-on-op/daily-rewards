import { LogEvent, Transaction, Chain } from "@covalenthq/client-sdk";
import { CategorizedStandardBridgeEvents, StandardBridgeEvent } from "../types";

export const extractLogEvents = (transactions: Transaction[]): LogEvent[] => {
  return transactions.flatMap((tx) => tx.log_events || []);
};

export const filterLogEventsBySenderAddresses =
  (addresses: string[]) =>
  (events: LogEvent[]): LogEvent[] =>
    events.filter((event) =>
      addresses.some(
        (address) =>
          event.sender_address?.toLowerCase() === address.toLowerCase()
      )
    );
