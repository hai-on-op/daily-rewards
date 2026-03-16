import { providers } from "ethers";
import { IBlockchainProvider } from "../../core/interfaces";

export class EthersBlockchainProvider implements IBlockchainProvider {
  private providerCache = new Map<string, providers.StaticJsonRpcProvider>();

  constructor(private rpcUrls: Record<string, string>) {}

  getProvider(name: string): providers.StaticJsonRpcProvider {
    const cached = this.providerCache.get(name);
    if (cached) return cached;

    const url = this.rpcUrls[name];
    if (!url) {
      throw new Error(`No RPC URL configured for provider "${name}"`);
    }

    const provider = new providers.StaticJsonRpcProvider(url);
    this.providerCache.set(name, provider);
    return provider;
  }

  async blockToTimestamp(
    block: number,
    providerName: string = "default"
  ): Promise<number> {
    const provider = this.getProvider(providerName);
    const blockData = await provider.getBlock(block);
    return blockData.timestamp;
  }
}
