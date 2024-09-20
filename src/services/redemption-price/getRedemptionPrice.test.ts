// getRedemptionPrice.test.ts

import {
  buildRedemptionPriceFromBlockQuery,
  buildRedemptionPriceFromTimestampQuery,
  fetchRedemptionPrice,
  processRedemptionPrice,
  getRedemptionPriceFromBlock,
  getRedemptionPriceFromTimestamp,
} from "./getRedemptionPrice";
import { subgraphQuery } from "../subgraph/utils";
import * as getRedemptionPriceModule from "./getRedemptionPrice";

jest.mock("../subgraph/utils", () => ({
  subgraphQuery: jest.fn(),
}));

describe("getRedemptionPrice Module", () => {
  const subgraphUrl = "http://example.com/geb-subgraph";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("buildRedemptionPriceFromBlockQuery", () => {
    it("should build the correct query string for block number", () => {
      const block = 123456;
      const expectedQuery = `
          {
            systemState(
              id: "current",
              block: { number: ${block} }
            ) {
              currentRedemptionPrice {
                value
              }
            }
          }
        `;
      const query = buildRedemptionPriceFromBlockQuery(block);
      expect(query.replace(/\s+/g, "")).toBe(expectedQuery.replace(/\s+/g, ""));
    });
  });

  describe("buildRedemptionPriceFromTimestampQuery", () => {
    it("should build the correct query string for timestamp", () => {
      const timestamp = 1609459200;
      const expectedQuery = `
          {
            redemptionPrices(
              orderBy: timestamp,
              orderDirection: desc,
              first: 1,
              where: { timestamp_lte: ${timestamp} }
            ) {
              value
            }
          }
        `;
      const query = buildRedemptionPriceFromTimestampQuery(timestamp);
      expect(query.replace(/\s+/g, "")).toBe(expectedQuery.replace(/\s+/g, ""));
    });
  });

  describe("fetchRedemptionPrice", () => {
    it("should fetch redemption price from block query response", async () => {
      const mockQuery = "block query";
      const mockResponse = {
        systemState: {
          currentRedemptionPrice: {
            value: "1.05",
          },
        },
      };
      (subgraphQuery as jest.Mock).mockResolvedValue(mockResponse);

      const result = await fetchRedemptionPrice(mockQuery, subgraphUrl);

      expect(subgraphQuery).toHaveBeenCalledWith(mockQuery, subgraphUrl);
      expect(result).toEqual({ value: "1.05" });
    });

    it("should fetch redemption price from timestamp query response", async () => {
      const mockQuery = "timestamp query";
      const mockResponse = {
        redemptionPrices: [
          {
            value: "1.05",
          },
        ],
      };
      (subgraphQuery as jest.Mock).mockResolvedValue(mockResponse);

      const result = await fetchRedemptionPrice(mockQuery, subgraphUrl);

      expect(subgraphQuery).toHaveBeenCalledWith(mockQuery, subgraphUrl);
      expect(result).toEqual({ value: "1.05" });
    });

    it("should throw an error if data is not found", async () => {
      const mockQuery = "invalid query";
      const mockResponse = {};
      (subgraphQuery as jest.Mock).mockResolvedValue(mockResponse);

      await expect(
        fetchRedemptionPrice(mockQuery, subgraphUrl)
      ).rejects.toThrow("Redemption price data not found in the response.");
    });
  });

  describe("processRedemptionPrice", () => {
    it("should process the redemption price data and return a number", () => {
      const data = { value: "1.05" };
      const result = processRedemptionPrice(data);
      expect(result).toBe(1.05);
    });
  });

  describe("getRedemptionPriceFromBlock", () => {
    it("should retrieve the redemption price from a block number", async () => {
      const block = 123456;
      const mockQuery = "block query";
      const mockData = { value: "1.05" };

      jest
        .spyOn(getRedemptionPriceModule, "buildRedemptionPriceFromBlockQuery")
        .mockReturnValue(mockQuery);
      jest
        .spyOn(getRedemptionPriceModule, "fetchRedemptionPrice")
        .mockResolvedValue(mockData);
      jest
        .spyOn(getRedemptionPriceModule, "processRedemptionPrice")
        .mockReturnValue(1.05);

      const result = await getRedemptionPriceModule.getRedemptionPriceFromBlock(
        block,
        subgraphUrl
      );

      expect(
        getRedemptionPriceModule.buildRedemptionPriceFromBlockQuery
      ).toHaveBeenCalledWith(block);
      expect(
        getRedemptionPriceModule.fetchRedemptionPrice
      ).toHaveBeenCalledWith(mockQuery, subgraphUrl);
      expect(
        getRedemptionPriceModule.processRedemptionPrice
      ).toHaveBeenCalledWith(mockData);
      expect(result).toBe(1.05);
    });
  });

  describe("getRedemptionPriceFromTimestamp", () => {
    it("should retrieve the redemption price from a timestamp", async () => {
      const timestamp = 1609459200;
      const mockQuery = "timestamp query";
      const mockData = { value: "1.05" };

      jest
        .spyOn(
          getRedemptionPriceModule,
          "buildRedemptionPriceFromTimestampQuery"
        )
        .mockReturnValue(mockQuery);
      jest
        .spyOn(getRedemptionPriceModule, "fetchRedemptionPrice")
        .mockResolvedValue(mockData);
      jest
        .spyOn(getRedemptionPriceModule, "processRedemptionPrice")
        .mockReturnValue(1.05);

      const result =
        await getRedemptionPriceModule.getRedemptionPriceFromTimestamp(
          timestamp,
          subgraphUrl
        );

      expect(
        getRedemptionPriceModule.buildRedemptionPriceFromTimestampQuery
      ).toHaveBeenCalledWith(timestamp);
      expect(
        getRedemptionPriceModule.fetchRedemptionPrice
      ).toHaveBeenCalledWith(mockQuery, subgraphUrl);
      expect(
        getRedemptionPriceModule.processRedemptionPrice
      ).toHaveBeenCalledWith(mockData);
      expect(result).toBe(1.05);
    });
  });
});
