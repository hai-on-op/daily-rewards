import { getSafeOwnerMapping } from "./getSafeOwnerMapping";
import { subgraphQueryPaginated } from "../subgraph/utils";
import { config } from "../../config";

// Mock dependencies
jest.mock("../subgraph/utils");
jest.mock("../../config", () => ({
  config: jest.fn().mockReturnValue({
    GEB_SUBGRAPH_URL: "https://geb.subgraph",
  }),
}));

describe("getSafeOwnerMapping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return empty map when no safe handlers exist", async () => {
    (subgraphQueryPaginated as jest.Mock).mockResolvedValue([]);

    const result = await getSafeOwnerMapping(1000);
    expect(result.size).toBe(0);
  });

  it("should correctly map safe handlers to owners", async () => {
    const mockSafeHandlers = [
      {
        id: "0xsafe1",
        owner: { address: "0xowner1" },
      },
      {
        id: "0xsafe2",
        owner: { address: "0xowner2" },
      },
    ];

    (subgraphQueryPaginated as jest.Mock).mockResolvedValue(mockSafeHandlers);

    const result = await getSafeOwnerMapping(1000);
    
    expect(result.size).toBe(2);
    expect(result.get("0xsafe1")).toBe("0xowner1");
    expect(result.get("0xsafe2")).toBe("0xowner2");
  });

  it("should use correct query parameters", async () => {
    (subgraphQueryPaginated as jest.Mock).mockResolvedValue([]);

    const blockNumber = 1000;
    await getSafeOwnerMapping(blockNumber);

    expect(subgraphQueryPaginated).toHaveBeenCalledWith(
      expect.stringContaining(`block: {number: ${blockNumber}}`),
      "safeHandlerOwners",
      "https://geb.subgraph"
    );
  });

  it("should handle multiple owners for same safe handler", async () => {
    const mockSafeHandlers = [
      {
        id: "0xsafe1",
        owner: { address: "0xowner1" },
      },
      {
        id: "0xsafe1",
        owner: { address: "0xowner2" },
      },
    ];

    (subgraphQueryPaginated as jest.Mock).mockResolvedValue(mockSafeHandlers);

    const result = await getSafeOwnerMapping(1000);
    
    expect(result.size).toBe(1);
    expect(result.get("0xsafe1")).toBe("0xowner2"); // Should take the last owner
  });

  it("should handle subgraph query errors", async () => {
    (subgraphQueryPaginated as jest.Mock).mockRejectedValue(
      new Error("Subgraph query failed")
    );

    await expect(getSafeOwnerMapping(1000)).rejects.toThrow("Subgraph query failed");
  });
}); 