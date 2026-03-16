import { Alchemy, Network, Utils } from "alchemy-sdk";
import {
  ITransferTracker,
  TokenTransfer,
} from "../../core/interfaces/ITransferTracker";

export class AlchemyTransferTracker implements ITransferTracker {
  private alchemy: Alchemy;

  constructor(apiKey: string, network: Network = Network.OPT_MAINNET) {
    this.alchemy = new Alchemy({ apiKey, network });
  }

  async getTransfers(
    senderAddress: string,
    recipientAddress: string,
    tokenAddresses: string[],
    tokenSymbolMap: Record<string, string>
  ): Promise<TokenTransfer[]> {
    const transferEventSignature = Utils.id(
      "Transfer(address,address,uint256)"
    );

    const allTransfers: TokenTransfer[] = [];

    for (const tokenAddress of tokenAddresses) {
      const filter = {
        address: tokenAddress,
        topics: [
          transferEventSignature,
          Utils.hexZeroPad(senderAddress, 32),
          Utils.hexZeroPad(recipientAddress, 32),
        ],
        fromBlock: "earliest" as const,
        toBlock: "latest" as const,
      };

      const logs = await this.alchemy.core.getLogs(filter);

      const transfers = logs.map((log) => {
        const value = BigInt(log.data);

        return {
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          from: `0x${log.topics[1].slice(26)}`,
          to: `0x${log.topics[2].slice(26)}`,
          value: value.toString(),
          tokenAddress: log.address,
          tokenSymbol:
            tokenSymbolMap[log.address.toLowerCase()] || "UNKNOWN",
        };
      });

      allTransfers.push(...transfers);
    }

    allTransfers.sort((a, b) => a.blockNumber - b.blockNumber);

    console.log(
      `Found ${allTransfers.length} total transfers across all tokens`
    );

    return allTransfers;
  }
}
