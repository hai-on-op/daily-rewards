import { providers } from "ethers";
import { EthersBlockchainProvider } from "./EthersBlockchainProvider";

jest.mock("ethers", () => {
  const mockGetBlock = jest.fn().mockResolvedValue({ timestamp: 1700000000 });
  const MockProvider = jest.fn().mockImplementation(() => ({
    getBlock: mockGetBlock,
    getBlockNumber: jest.fn().mockResolvedValue(12345),
  }));

  return {
    providers: {
      StaticJsonRpcProvider: MockProvider,
    },
  };
});

describe("EthersBlockchainProvider", () => {
  let bp: EthersBlockchainProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    bp = new EthersBlockchainProvider({
      default: "http://rpc-default",
      lp: "http://rpc-lp",
      minter: "http://rpc-minter",
    });
  });

  describe("getProvider", () => {
    it("should create a provider for a known name", () => {
      const provider = bp.getProvider("default");

      expect(providers.StaticJsonRpcProvider).toHaveBeenCalledWith(
        "http://rpc-default"
      );
      expect(provider).toBeDefined();
    });

    it("should cache provider on subsequent calls", () => {
      const first = bp.getProvider("lp");
      const second = bp.getProvider("lp");

      expect(first).toBe(second);
      expect(providers.StaticJsonRpcProvider).toHaveBeenCalledTimes(1);
    });

    it("should create separate providers for different names", () => {
      bp.getProvider("default");
      bp.getProvider("lp");

      expect(providers.StaticJsonRpcProvider).toHaveBeenCalledTimes(2);
      expect(providers.StaticJsonRpcProvider).toHaveBeenCalledWith(
        "http://rpc-default"
      );
      expect(providers.StaticJsonRpcProvider).toHaveBeenCalledWith(
        "http://rpc-lp"
      );
    });

    it("should throw for unknown provider name", () => {
      expect(() => bp.getProvider("unknown")).toThrow(
        'No RPC URL configured for provider "unknown"'
      );
    });
  });

  describe("blockToTimestamp", () => {
    it("should return timestamp for the given block", async () => {
      const timestamp = await bp.blockToTimestamp(100);

      const provider = bp.getProvider("default");
      expect(provider.getBlock).toHaveBeenCalledWith(100);
      expect(timestamp).toBe(1700000000);
    });

    it("should use specified provider name", async () => {
      await bp.blockToTimestamp(200, "lp");

      const provider = bp.getProvider("lp");
      expect(provider.getBlock).toHaveBeenCalledWith(200);
    });
  });
});
