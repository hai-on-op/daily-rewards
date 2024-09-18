// getInitialSafesDebt.test.ts

import * as moduleUnderTest from "./getInitialSafesDebt";
import { subgraphQueryPaginated } from "../subgraph/utils";
import { getAccumulatedRate } from "./getAccumulatedRate";

jest.mock("../subgraph/utils", () => ({
  subgraphQueryPaginated: jest.fn(),
}));

jest.mock("./getAccumulatedRate", () => ({
  getAccumulatedRate: jest.fn(),
}));

describe("getInitialSafesDebt Module", () => {
  const startBlock = 123456;
  const ownerMapping = new Map<string, string>([
    ["handler1", "owner1"],
    ["handler2", "owner2"],
  ]);
  const collateralTypes = ["ETH-A", "BAT-A"];
  const subgraphUrl = "http://example.com/subgraph";
  const cType = "ETH-A";

  const queryWithCType = `
    {
      safes(
        where: { debt_gt: 0, collateralType: "${cType}" },
        first: 1000,
        skip: [[skip]],
        block: { number: ${startBlock} }
      ) {
        debt
        safeHandler
        collateralType { id }
      }
    }
  `;

  const queryWithoutCType = `
    {
      safes(
        where: { debt_gt: 0 },
        first: 1000,
        skip: [[skip]],
        block: { number: ${startBlock} }
      ) {
        debt
        safeHandler
        collateralType { id }
      }
    }
  `;

  const debtsGraph = [
    {
      debt: "100",
      safeHandler: "handler1",
      collateralType: { id: "ETH-A" },
    },
    {
      debt: "200",
      safeHandler: "handler2",
      collateralType: { id: "BAT-A" },
    },
    {
      debt: "300",
      safeHandler: "handler3",
      collateralType: { id: "ETH-A" },
    },
  ];

  const rates = {
    "ETH-A": 1.05,
    "BAT-A": 1.02,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("buildSafesDebtQuery", () => {
    it("should build the correct query string with cType", () => {
      const result = moduleUnderTest.buildSafesDebtQuery(startBlock, cType);
      expect(result.replace(/\s+/g, "")).toBe(
        queryWithCType.replace(/\s+/g, "")
      );
    });

    it("should build the correct query string without cType", () => {
      const result = moduleUnderTest.buildSafesDebtQuery(startBlock);
      expect(result.replace(/\s+/g, "")).toBe(
        queryWithoutCType.replace(/\s+/g, "")
      );
    });
  });

  describe("fetchSafesDebt", () => {
    it("should fetch safes with debt using the provided query and subgraph URL", async () => {
      (subgraphQueryPaginated as jest.Mock).mockResolvedValue(debtsGraph);

      const result = await moduleUnderTest.fetchSafesDebt(
        queryWithCType,
        subgraphUrl
      );

      expect(subgraphQueryPaginated).toHaveBeenCalledWith(
        queryWithCType,
        "safes",
        subgraphUrl
      );
      expect(result).toEqual(debtsGraph);
    });
  });

  describe("processSafesDebt", () => {
    it("should process debts correctly", async () => {
      (getAccumulatedRate as jest.Mock).mockImplementation(
        async (block, cType) => {
          //@ts-ignore
          return rates[cType];
        }
      );

      const result = await moduleUnderTest.processSafesDebt(
        debtsGraph,
        ownerMapping,
        startBlock,
        collateralTypes,
        subgraphUrl
      );

      expect(getAccumulatedRate).toHaveBeenCalledTimes(collateralTypes.length);
      expect(result).toEqual([
        { address: "owner1", debt: 100 * rates["ETH-A"] },
        { address: "owner2", debt: 200 * rates["BAT-A"] },
      ]);
    });
  });

  describe("getInitialSafesDebt", () => {
    it("should retrieve and process safes debts correctly with cType", async () => {
      jest
        .spyOn(moduleUnderTest, "buildSafesDebtQuery")
        .mockReturnValue(queryWithCType);
      jest
        .spyOn(moduleUnderTest, "fetchSafesDebt")
        .mockResolvedValue(debtsGraph);
      jest
        .spyOn(moduleUnderTest, "processSafesDebt")
        .mockResolvedValue([{ address: "owner1", debt: 105 }]);

      const result = await moduleUnderTest.getInitialSafesDebt(
        startBlock,
        ownerMapping,
        collateralTypes,
        subgraphUrl,
        cType
      );

      expect(moduleUnderTest.buildSafesDebtQuery).toHaveBeenCalledWith(
        startBlock,
        cType
      );
      expect(moduleUnderTest.fetchSafesDebt).toHaveBeenCalledWith(
        queryWithCType,
        subgraphUrl
      );
      expect(moduleUnderTest.processSafesDebt).toHaveBeenCalled();
      expect(result).toEqual([{ address: "owner1", debt: 105 }]);
    });

    it("should retrieve and process safes debts correctly without cType", async () => {
      jest
        .spyOn(moduleUnderTest, "buildSafesDebtQuery")
        .mockReturnValue(queryWithoutCType);
      jest
        .spyOn(moduleUnderTest, "fetchSafesDebt")
        .mockResolvedValue(debtsGraph);
      jest.spyOn(moduleUnderTest, "processSafesDebt").mockResolvedValue([
        { address: "owner1", debt: 105 },
        { address: "owner2", debt: 204 },
      ]);

      const result = await moduleUnderTest.getInitialSafesDebt(
        startBlock,
        ownerMapping,
        collateralTypes,
        subgraphUrl
      );

      expect(moduleUnderTest.buildSafesDebtQuery).toHaveBeenCalledWith(
        startBlock,
        undefined
      );
      expect(moduleUnderTest.fetchSafesDebt).toHaveBeenCalledWith(
        queryWithoutCType,
        subgraphUrl
      );
      expect(moduleUnderTest.processSafesDebt).toHaveBeenCalled();
      expect(result).toEqual([
        { address: "owner1", debt: 105 },
        { address: "owner2", debt: 204 },
      ]);
    });
  });
});
