import { providers } from "ethers";
import { config } from "../config";
export const provider = new providers.StaticJsonRpcProvider(config().RPC_URL);

export const lpProvider = new providers.StaticJsonRpcProvider(
  config().LP_RPC_URL
);

export const minterProvider = new providers.StaticJsonRpcProvider(
  config().MINTER_RPC_URL
);

export const blockToTimestamp = async (block: number) => {
  return (await provider.getBlock(block)).timestamp;
};
