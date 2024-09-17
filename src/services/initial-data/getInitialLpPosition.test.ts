// fetchLpPositions.test.ts
import {
  buildLpPositionsQuery,
  fetchLpPositions,
  processLpPositions,
  getInitialLpPosition,
} from "./getInitialLpPosition";
import * as moduleUnderTest from "./getInitialLpPosition";
import { subgraphQueryPaginated } from "../subgraph/utils";
import { RawPosition, UserPositions } from "../../types";

describe("buildLpPositionsQuery", () => {
  it("should build the correct query string", () => {
    const startBlock = 123456;
    const poolAddress = "0xPoolAddress";
    const expectedQuery = `
      {
        positions(
          block: { number: ${startBlock} },
          where: { pool: "${poolAddress}" },
          first: 1000,
          skip: [[skip]]
        ) {
          id
          owner
          liquidity
          tickLower { tickIdx }
          tickUpper { tickIdx }
        }
      }
    `;

    const query = buildLpPositionsQuery(startBlock, poolAddress);
    expect(query.replace(/\s+/g, "")).toBe(expectedQuery.replace(/\s+/g, ""));
  });
});

jest.mock("../subgraph/utils", () => ({
  subgraphQueryPaginated: jest.fn(),
}));

describe("fetchLpPositions", () => {
  it("should fetch LP positions using the provided query and subgraph URL", async () => {
    const query = "query string";
    const subgraphUrl = "http://example.com/subgraph";
    const mockResponse = [
      {
        id: "1",
        owner: "0xOwner1",
        liquidity: "1000",
        tickLower: { tickIdx: "10" },
        tickUpper: { tickIdx: "20" },
      },
      {
        id: "2",
        owner: "0xOwner2",
        liquidity: "2000",
        tickLower: { tickIdx: "15" },
        tickUpper: { tickIdx: "25" },
      },
    ];

    (subgraphQueryPaginated as jest.Mock).mockResolvedValue(mockResponse);

    const result = await fetchLpPositions(query, subgraphUrl);

    expect(subgraphQueryPaginated).toHaveBeenCalledWith(
      query,
      "positions",
      subgraphUrl
    );
    expect(result).toEqual(mockResponse);
  });
});

describe("processLpPositions", () => {
  it("should process raw positions into user positions", () => {
    const rawPositions: RawPosition[] = [
      {
        id: "1",
        owner: "0xOwner1",
        liquidity: "1000",
        tickLower: { tickIdx: "10" },
        tickUpper: { tickIdx: "20" },
      },
      {
        id: "2",
        owner: "0xOwner1",
        liquidity: "1500",
        tickLower: { tickIdx: "15" },
        tickUpper: { tickIdx: "25" },
      },
      {
        id: "3",
        owner: "0xOwner2",
        liquidity: "2000",
        tickLower: { tickIdx: "20" },
        tickUpper: { tickIdx: "30" },
      },
    ];

    const expectedUserPositions: UserPositions = {
      "0xOwner1": {
        positions: [
          {
            lowerTick: 10,
            upperTick: 20,
            liquidity: 1000,
            tokenId: 1,
          },
          {
            lowerTick: 15,
            upperTick: 25,
            liquidity: 1500,
            tokenId: 2,
          },
        ],
      },
      "0xOwner2": {
        positions: [
          {
            lowerTick: 20,
            upperTick: 30,
            liquidity: 2000,
            tokenId: 3,
          },
        ],
      },
    };

    const result = processLpPositions(rawPositions);

    expect(result).toEqual(expectedUserPositions);
  });
});

describe("getInitialLpPosition", () => {
  afterEach(() => {
    // Restore all mocks after each test
    jest.restoreAllMocks();
  });

  it("should get and process initial LP positions", async () => {
    const startBlock = 123456;
    const poolAddress = "0xPoolAddress";
    const subgraphUrl = "http://example.com/subgraph";

    const query = "generated query";
    const rawPositions: RawPosition[] = [
      {
        id: "1",
        owner: "0xOwner1",
        liquidity: "1000",
        tickLower: { tickIdx: "10" },
        tickUpper: { tickIdx: "20" },
      },
    ];

    const userPositions = {
      "0xOwner1": {
        positions: [
          {
            lowerTick: 10,
            upperTick: 20,
            liquidity: 1000,
            tokenId: 1,
          },
        ],
      },
    };

    // Mock the buildLpPositionsQuery function
    const buildLpPositionsQuerySpy = jest
      .spyOn(moduleUnderTest, "buildLpPositionsQuery")
      .mockReturnValue(query);

    // Mock fetchLpPositions
    jest
      .spyOn(moduleUnderTest, "fetchLpPositions")
      .mockResolvedValue(rawPositions);

    // Mock processLpPositions
    jest
      .spyOn(moduleUnderTest, "processLpPositions")
      .mockReturnValue(userPositions);

    const result = await getInitialLpPosition(
      startBlock,
      poolAddress,
      subgraphUrl
    );

    expect(buildLpPositionsQuerySpy).toHaveBeenCalledWith(
      startBlock,
      poolAddress
    );
    expect(moduleUnderTest.fetchLpPositions).toHaveBeenCalledWith(
      query,
      subgraphUrl
    );
    expect(moduleUnderTest.processLpPositions).toHaveBeenCalledWith(
      rawPositions
    );
    expect(result).toEqual(userPositions);
  });
});
