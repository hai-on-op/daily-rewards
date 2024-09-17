// getAccumulatedRate.test.ts

import {
  buildAccumulatedRateQuery,
  fetchAccumulatedRate,
  processAccumulatedRate,
  getAccumulatedRate,
} from "./getAccumulatedRate";
// getAccumulatedRate.test.ts

import * as moduleUnderTest from "./getAccumulatedRate";
import { subgraphQuery } from "../subgraph/utils";

jest.mock("../subgraph/utils", () => ({
  subgraphQuery: jest.fn(),
}));

describe("getAccumulatedRate Module", () => {
  const block = 123456;
  const cType = "ETH-A";
  const subgraphUrl = "http://example.com/subgraph";

  const query = `
    {
      collateralType(id: "${cType}", block: { number: ${block} }) {
        accumulatedRate
      }
    }
  `;

  const mockData = {
    collateralType: {
      accumulatedRate: "1.05",
    },
  };

  const expectedRate = 1.05;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("buildAccumulatedRateQuery", () => {
    it("should build the correct query string", () => {
      const result = moduleUnderTest.buildAccumulatedRateQuery(block, cType);
      expect(result.replace(/\s+/g, "")).toBe(query.replace(/\s+/g, ""));
    });
  });

  describe("fetchAccumulatedRate", () => {
    it("should fetch accumulated rate data using the provided query and subgraph URL", async () => {
      (subgraphQuery as jest.Mock).mockResolvedValue(mockData);

      const result = await moduleUnderTest.fetchAccumulatedRate(
        query,
        subgraphUrl
      );

      expect(subgraphQuery).toHaveBeenCalledWith(query, subgraphUrl);
      expect(result).toEqual(mockData);
    });
  });

  describe("processAccumulatedRate", () => {
    it("should process the data and return the accumulated rate as a number", () => {
      const result = moduleUnderTest.processAccumulatedRate(mockData);
      expect(result).toBe(expectedRate);
    });
  });

  describe("getAccumulatedRate", () => {
    it("should retrieve and process the accumulated rate correctly", async () => {
      // Mock the internal functions
      jest
        .spyOn(moduleUnderTest, "buildAccumulatedRateQuery")
        .mockReturnValue(query);
      jest
        .spyOn(moduleUnderTest, "fetchAccumulatedRate")
        .mockResolvedValue(mockData);
      jest
        .spyOn(moduleUnderTest, "processAccumulatedRate")
        .mockReturnValue(expectedRate);

      const result = await moduleUnderTest.getAccumulatedRate(
        block,
        cType,
        subgraphUrl
      );

      expect(moduleUnderTest.buildAccumulatedRateQuery).toHaveBeenCalledWith(
        block,
        cType
      );
      expect(moduleUnderTest.fetchAccumulatedRate).toHaveBeenCalledWith(
        query,
        subgraphUrl
      );
      expect(moduleUnderTest.processAccumulatedRate).toHaveBeenCalledWith(
        mockData
      );
      expect(result).toBe(expectedRate);
    });
  });
});
