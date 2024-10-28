import { providers } from "ethers";

export const provider = {
  getBlock: jest.fn().mockResolvedValue({ timestamp: 1000 }),
} as unknown as providers.StaticJsonRpcProvider;
