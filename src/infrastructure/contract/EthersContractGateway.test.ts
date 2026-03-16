import { EthersContractGateway } from "./EthersContractGateway";

const mockPaused = jest.fn();
const mockEpochCounter = jest.fn();
const mockPause = jest.fn();
const mockUnpause = jest.fn();
const mockStartInitialEpoch = jest.fn();
const mockUpdateMerkleRoots = jest.fn();

jest.mock("ethers", () => {
  const MockContract = jest.fn().mockImplementation(() => ({
    paused: mockPaused,
    epochCounter: mockEpochCounter,
    pause: mockPause,
    unpause: mockUnpause,
    startInitialEpoch: mockStartInitialEpoch,
    updateMerkleRoots: mockUpdateMerkleRoots,
  }));

  const MockWallet = jest.fn().mockImplementation(() => ({}));
  const MockProvider = jest.fn().mockImplementation(() => ({}));

  return {
    ethers: {
      Contract: MockContract,
      Wallet: MockWallet,
      providers: {
        JsonRpcProvider: MockProvider,
      },
    },
  };
});

jest.mock("../../abis/REWARD_DISTRIBUTOR_ABI", () => ({
  REWARD_DISTRIBUTOR_ABI: [],
}));

const mockReceipt = {
  blockNumber: 12345,
  gasUsed: { toString: () => "21000" },
};

const mockTx = {
  hash: "0xtxhash123",
  wait: jest.fn().mockResolvedValue(mockReceipt),
};

describe("EthersContractGateway", () => {
  let gateway: EthersContractGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.wait.mockResolvedValue(mockReceipt);
    gateway = new EthersContractGateway(
      "http://rpc",
      "0xprivatekey",
      "0xcontract"
    );
  });

  describe("isPaused", () => {
    it("should return true when contract is paused", async () => {
      mockPaused.mockResolvedValue(true);
      expect(await gateway.isPaused()).toBe(true);
    });

    it("should return false when contract is not paused", async () => {
      mockPaused.mockResolvedValue(false);
      expect(await gateway.isPaused()).toBe(false);
    });
  });

  describe("getEpochCounter", () => {
    it("should convert BigNumber-like response to number", async () => {
      mockEpochCounter.mockResolvedValue({ toString: () => "5" });
      expect(await gateway.getEpochCounter()).toBe(5);
    });

    it("should handle zero epoch counter", async () => {
      mockEpochCounter.mockResolvedValue({ toString: () => "0" });
      expect(await gateway.getEpochCounter()).toBe(0);
    });
  });

  describe("pause", () => {
    it("should call contract.pause and return TransactionResult", async () => {
      mockPause.mockResolvedValue(mockTx);

      const result = await gateway.pause();

      expect(mockPause).toHaveBeenCalled();
      expect(mockTx.wait).toHaveBeenCalled();
      expect(result).toEqual({
        hash: "0xtxhash123",
        blockNumber: 12345,
        gasUsed: "21000",
      });
    });

    it("should propagate errors", async () => {
      mockPause.mockRejectedValue(new Error("Insufficient gas"));

      await expect(gateway.pause()).rejects.toThrow("Insufficient gas");
    });
  });

  describe("unpause", () => {
    it("should call contract.unpause and return TransactionResult", async () => {
      mockUnpause.mockResolvedValue(mockTx);

      const result = await gateway.unpause();

      expect(mockUnpause).toHaveBeenCalled();
      expect(result.hash).toBe("0xtxhash123");
    });
  });

  describe("startInitialEpoch", () => {
    it("should call contract.startInitialEpoch and return TransactionResult", async () => {
      mockStartInitialEpoch.mockResolvedValue(mockTx);

      const result = await gateway.startInitialEpoch();

      expect(mockStartInitialEpoch).toHaveBeenCalled();
      expect(result.hash).toBe("0xtxhash123");
      expect(result.blockNumber).toBe(12345);
    });
  });

  describe("updateMerkleRoots", () => {
    it("should pass arrays correctly to contract", async () => {
      mockUpdateMerkleRoots.mockResolvedValue(mockTx);

      const tokens = ["0xKITE", "0xOP"];
      const roots = ["0xroot1", "0xroot2"];
      const result = await gateway.updateMerkleRoots(tokens, roots);

      expect(mockUpdateMerkleRoots).toHaveBeenCalledWith(tokens, roots);
      expect(result.hash).toBe("0xtxhash123");
    });

    it("should propagate receipt wait errors", async () => {
      const failingTx = {
        hash: "0xfail",
        wait: jest.fn().mockRejectedValue(new Error("Reverted")),
      };
      mockUpdateMerkleRoots.mockResolvedValue(failingTx);

      await expect(
        gateway.updateMerkleRoots(["0xKITE"], ["0xroot"])
      ).rejects.toThrow("Reverted");
    });
  });
});
