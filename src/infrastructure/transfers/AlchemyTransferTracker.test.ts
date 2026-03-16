import { AlchemyTransferTracker } from "./AlchemyTransferTracker";

const mockGetLogs = jest.fn();

jest.mock("alchemy-sdk", () => ({
  Alchemy: jest.fn().mockImplementation(() => ({
    core: { getLogs: mockGetLogs },
  })),
  Network: { OPT_MAINNET: "opt-mainnet" },
  Utils: {
    id: jest.fn().mockReturnValue("0xtransfersig"),
    hexZeroPad: jest.fn().mockImplementation((addr: string, _len: number) => {
      return "0x" + "0".repeat(24) + addr.replace("0x", "");
    }),
  },
}));

const symbolMap: Record<string, string> = {
  "0xtoken1": "KITE",
  "0xtoken2": "OP",
};

describe("AlchemyTransferTracker", () => {
  let tracker: AlchemyTransferTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    tracker = new AlchemyTransferTracker("test-api-key");
  });

  it("should return empty array when no logs found", async () => {
    mockGetLogs.mockResolvedValue([]);

    const result = await tracker.getTransfers(
      "0xsender",
      "0xrecipient",
      ["0xtoken1"],
      symbolMap
    );

    expect(result).toEqual([]);
  });

  it("should decode a single Transfer log correctly", async () => {
    mockGetLogs.mockResolvedValue([
      {
        blockNumber: 100,
        transactionHash: "0xtx1",
        address: "0xtoken1",
        data: "0x" + "0".repeat(63) + "a", // 10 in hex
        topics: [
          "0xtransfersig",
          "0x" + "0".repeat(24) + "sender",
          "0x" + "0".repeat(24) + "recipient",
        ],
      },
    ]);

    const result = await tracker.getTransfers(
      "0xsender",
      "0xrecipient",
      ["0xtoken1"],
      symbolMap
    );

    expect(result).toHaveLength(1);
    expect(result[0].blockNumber).toBe(100);
    expect(result[0].transactionHash).toBe("0xtx1");
    expect(result[0].tokenAddress).toBe("0xtoken1");
    expect(result[0].tokenSymbol).toBe("KITE");
    expect(result[0].value).toBe("10");
  });

  it("should handle multiple tokens and sort by blockNumber", async () => {
    mockGetLogs
      .mockResolvedValueOnce([
        {
          blockNumber: 200,
          transactionHash: "0xtx2",
          address: "0xtoken1",
          data: "0x" + "0".repeat(62) + "14", // 20
          topics: ["0xtransfersig", "0x" + "0".repeat(24) + "s", "0x" + "0".repeat(24) + "r"],
        },
      ])
      .mockResolvedValueOnce([
        {
          blockNumber: 100,
          transactionHash: "0xtx1",
          address: "0xtoken2",
          data: "0x" + "0".repeat(62) + "0a", // 10
          topics: ["0xtransfersig", "0x" + "0".repeat(24) + "s", "0x" + "0".repeat(24) + "r"],
        },
      ]);

    const result = await tracker.getTransfers(
      "0xsender",
      "0xrecipient",
      ["0xtoken1", "0xtoken2"],
      symbolMap
    );

    expect(result).toHaveLength(2);
    expect(result[0].blockNumber).toBe(100); // sorted first
    expect(result[0].tokenSymbol).toBe("OP");
    expect(result[1].blockNumber).toBe(200);
    expect(result[1].tokenSymbol).toBe("KITE");
  });

  it("should return UNKNOWN for unmapped token addresses", async () => {
    mockGetLogs.mockResolvedValue([
      {
        blockNumber: 50,
        transactionHash: "0xtx3",
        address: "0xunknowntoken",
        data: "0x" + "0".repeat(63) + "1",
        topics: ["0xtransfersig", "0x" + "0".repeat(24) + "s", "0x" + "0".repeat(24) + "r"],
      },
    ]);

    const result = await tracker.getTransfers(
      "0xsender",
      "0xrecipient",
      ["0xunknowntoken"],
      symbolMap
    );

    expect(result[0].tokenSymbol).toBe("UNKNOWN");
  });

  it("should propagate errors from getLogs", async () => {
    mockGetLogs.mockRejectedValue(new Error("Alchemy API error"));

    await expect(
      tracker.getTransfers("0xsender", "0xrecipient", ["0xtoken1"], symbolMap)
    ).rejects.toThrow("Alchemy API error");
  });
});
