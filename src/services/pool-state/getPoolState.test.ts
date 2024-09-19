import * as getPoolStateModule from "./getPoolState";
import { subgraphQuery } from "../subgraph/utils";

jest.mock("../subgraph/utils", () => ({
  subgraphQuery: jest.fn(),
}));

describe("getPoolState Module", () => {
  const block = 123456;
  const poolId = "0xPoolAddress";
  const subgraphUrl = "http://example.com/subgraph";

  const query = `
    {
      pool(
        id: "${poolId}"
      ) {
        sqrtPrice
      }
    }
  `;

  const mockPoolState = {
    sqrtPrice: "79228162514264337593543950336",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("buildPoolStateQuery", () => {
    it("should build the correct query string", () => {
      const result = getPoolStateModule.buildPoolStateQuery(block, poolId);
      expect(result.replace(/\s+/g, "")).toBe(query.replace(/\s+/g, ""));
    });
  });

  describe("fetchPoolState", () => {
    it("should fetch the pool state using the provided query and subgraph URL", async () => {
      (subgraphQuery as jest.Mock).mockResolvedValue({ pool: mockPoolState });

      const result = await getPoolStateModule.fetchPoolState(
        query,
        subgraphUrl
      );

      expect(subgraphQuery).toHaveBeenCalledWith(query, subgraphUrl);
      expect(result).toEqual(mockPoolState);
    });
  });

  describe("getPoolState", () => {
    it("should retrieve the pool state correctly", async () => {
      const mockBuildPoolStateQuery = jest
        .spyOn(getPoolStateModule, "buildPoolStateQuery")
        .mockReturnValue(query);
      const mockFetchPoolState = jest
        .spyOn(getPoolStateModule, "fetchPoolState")
        .mockResolvedValue(mockPoolState);

      const result = await getPoolStateModule.getPoolState(
        block,
        poolId,
        subgraphUrl
      );

      expect(mockBuildPoolStateQuery).toHaveBeenCalledWith(block, poolId);
      expect(mockFetchPoolState).toHaveBeenCalledWith(query, subgraphUrl);
      expect(result).toEqual(mockPoolState);

      mockBuildPoolStateQuery.mockRestore();
      mockFetchPoolState.mockRestore();
    });
  });
});
