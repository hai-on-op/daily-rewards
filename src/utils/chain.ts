import { config } from "../config";
import { EthersBlockchainProvider } from "../infrastructure/blockchain/EthersBlockchainProvider";

const cfg = config();

const blockchainProvider = new EthersBlockchainProvider({
  default: cfg.RPC_URL,
  lp: cfg.LP_RPC_URL,
  minter: cfg.MINTER_RPC_URL,
  haivelo: cfg.HAIVELO_RPC_URL,
  lpStaking: cfg.LP_STAKING_RPC_URL,
});

export const provider = blockchainProvider.getProvider("default");
export const lpProvider = blockchainProvider.getProvider("lp");
export const minterProvider = blockchainProvider.getProvider("minter");
export const haiveloProvider = blockchainProvider.getProvider("haivelo");
export const lpStakingProvider = blockchainProvider.getProvider("lpStaking");

export const blockToTimestamp = async (block: number) => {
  return blockchainProvider.blockToTimestamp(block);
};
