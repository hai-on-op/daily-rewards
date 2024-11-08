import { ethers } from "ethers";
import { BridgedAmountsDetailed } from "./types";

export function getBridgedTokensAtBlock(
  bridgedAmountsDetailed: BridgedAmountsDetailed,
  address: string,
  tokenName: string,
  blockNumber: number
): number {
  // Find the user's data
  const userData = bridgedAmountsDetailed.find(
    (user) => user?.address?.toLowerCase() === address.toLowerCase()
  );

  if (!userData) {
    return 0;
  }

  // Filter and sum the bridged amounts
  const totalAmount = userData.bridgeTransactions
    .filter(
      (tx) =>
        tx.token.toLowerCase() === tokenName.toLowerCase() &&
        tx.blockHeight <= blockNumber
    )
    .reduce((sum, tx) => sum + BigInt(tx.amount), BigInt(0));


  // Parse the total amount to 18 decimal places and convert to number
  const parsedAmount = ethers.utils.formatUnits(totalAmount.toString(), 18);
  return parseFloat(parsedAmount);
}
