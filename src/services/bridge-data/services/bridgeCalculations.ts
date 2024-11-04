import { BigNumber, ethers } from "ethers";
import { StandardBridgeEvent, ApxETHTransferEvent, HopRETHTransferEvent, LidoWstETHTransferEvent } from "../types";
import { CategorizedStandardBridgeEvents } from "../types";

export const calculateStandardBridgeAmount = (
  categorizedEvents: CategorizedStandardBridgeEvents,
  tokenAddress: string
): BigNumber => {
  const events = categorizedEvents[tokenAddress.toLowerCase()] || [];
  return events.reduce((sum, event) => sum.add(BigNumber.from(event.amount)), BigNumber.from(0));
};

export const calculateApxETHAmount = (events: ApxETHTransferEvent[]): BigNumber => {
  return events.reduce((sum, event) => sum.add(BigNumber.from(event.amount)), BigNumber.from(0));
};

export const calculateHopRETHAmount = (events: HopRETHTransferEvent[]): BigNumber => {
  return events.reduce((sum, event) => sum.add(BigNumber.from(event.amount)), BigNumber.from(0));
};

export const calculateLidoWstETHAmount = (events: LidoWstETHTransferEvent[]): BigNumber => {
  return events.reduce((sum, event) => sum.add(BigNumber.from(event.amount)), BigNumber.from(0));
};

export const calculateTotalBridgedAmounts = (
  userAddress: string,
  standardBridgeEvents: CategorizedStandardBridgeEvents,
  apxETHEvents: ApxETHTransferEvent[],
  hopRETHEvents: HopRETHTransferEvent[],
  lidoWstETHEvents: LidoWstETHTransferEvent[],
  wstETHAddress: string,
  rethAddress: string,
  apxETHAddress: string
) => {
  const standardBridgeWstETH = calculateStandardBridgeAmount(standardBridgeEvents, wstETHAddress);
  const standardBridgeRETH = calculateStandardBridgeAmount(standardBridgeEvents, rethAddress);
  const standardBridgeApxETH = calculateStandardBridgeAmount(standardBridgeEvents, apxETHAddress);

  const apxETHAmount = calculateApxETHAmount(apxETHEvents);
  const hopRETHAmount = calculateHopRETHAmount(hopRETHEvents);
  const lidoWstETHAmount = calculateLidoWstETHAmount(lidoWstETHEvents);

  const formatAmount = (amount: BigNumber) => ({
    raw: amount.toString(),
    formatted: ethers.utils.formatUnits(amount, 18)
  });

  const zeroAmount = formatAmount(BigNumber.from(0));

  const wstETHTotal = standardBridgeWstETH.add(lidoWstETHAmount);
  const rETHTotal = standardBridgeRETH.add(hopRETHAmount);
  const apxETHTotal = standardBridgeApxETH.add(apxETHAmount);
  const combinedTotal = wstETHTotal.add(rETHTotal).add(apxETHTotal);

  return {
    userAddress,
    tokens: {
      wstETH: {
        standardBridge: formatAmount(standardBridgeWstETH),
        lidoBridge: formatAmount(lidoWstETHAmount),
        total: formatAmount(wstETHTotal)
      },
      rETH: {
        standardBridge: formatAmount(standardBridgeRETH),
        hopBridge: formatAmount(hopRETHAmount),
        lidoBridge: zeroAmount, // Add this line
        total: formatAmount(rETHTotal)
      },
      apxETH: {
        standardBridge: formatAmount(standardBridgeApxETH),
        apxBridge: formatAmount(apxETHAmount),
        lidoBridge: zeroAmount, // Add this line
        total: formatAmount(apxETHTotal)
      }
    },
    totalCombined: formatAmount(combinedTotal)
  };
};