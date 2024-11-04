import { Transaction } from "@covalenthq/client-sdk";
import { BigNumber } from "ethers";

export type TransactionFetcher = (
  walletAddress: string
) => Promise<Transaction[]>;

export type StandardBridgeEvent = {
  name: string;
  from: string;
  to: string;
  amount: string;
  extraData: string;
  localToken?: string;
  remoteToken?: string;
};

export type CategorizedStandardBridgeEvents = {
  eth: StandardBridgeEvent[];
  [key: string]: StandardBridgeEvent[]; // For ERC20 tokens
};

export type TotalBridgedAmount = {
  eth: BigNumber;
  [key: string]: BigNumber; // For ERC20 tokens
};

export type ApxETHTransferEvent = {
  from: string;
  to: string;
  amount: string;
  blockHeight: number | null;
};

export type HopRETHTransferEvent = {
  from: string;
  to: string;
  amount: string;
  blockHeight: number | null;
};

export interface FormattedAmount {
  raw: string;
  formatted: string;
}

export interface TokenAmounts {
  standardBridge: FormattedAmount;
  hopBridge?: FormattedAmount;
  apxBridge?: FormattedAmount;
  lidoBridge: FormattedAmount; // Change this line: remove the optional '?' and make it required
  total: FormattedAmount;
}

export interface BridgedAmounts {
  userAddress: string;
  tokens: {
    wstETH: TokenAmounts;
    rETH: TokenAmounts;
    apxETH: TokenAmounts;
  };
  totalCombined: FormattedAmount;
}

export interface LidoWstETHTransferEvent {
  from: string;
  to: string;
  amount: string;
  blockHeight: number | null;
}
