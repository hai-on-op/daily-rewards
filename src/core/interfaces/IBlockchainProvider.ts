import { providers } from "ethers";

export interface IBlockchainProvider {
  getProvider(name: string): providers.JsonRpcProvider;
  blockToTimestamp(block: number, providerName?: string): Promise<number>;
}
