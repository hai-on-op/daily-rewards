import Axios from "axios";
import { AxiosSubgraphClient } from "./AxiosSubgraphClient";

jest.mock("axios");

const mockedAxios = Axios as jest.Mocked<typeof Axios>;

describe("AxiosSubgraphClient", () => {
  let client: AxiosSubgraphClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AxiosSubgraphClient(false);
  });

  describe("query", () => {
    it("should return resp.data.data on success", async () => {
      const mockData = { users: [{ id: "1" }] };
      mockedAxios.post.mockResolvedValue({ data: { data: mockData } });

      const result = await client.query("{ users { id } }", "http://subgraph");

      expect(mockedAxios.post).toHaveBeenCalledWith("http://subgraph", {
        query: "{ users { id } }",
      });
      expect(result).toEqual(mockData);
    });

    it("should throw on network error", async () => {
      jest.useFakeTimers();
      mockedAxios.post.mockRejectedValue(new Error("Network failure"));
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      try {
        const queryExpectation = expect(
          client.query("{ users { id } }", "http://subgraph")
        ).rejects.toThrow("Error with subgraph query:");

        await jest.runAllTimersAsync();
        await queryExpectation;

        expect(mockedAxios.post).toHaveBeenCalledTimes(6);
      } finally {
        consoleSpy.mockRestore();
        jest.useRealTimers();
      }
    });

    it("should throw when response has no data", async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });

      await expect(
        client.query("{ users { id } }", "http://subgraph")
      ).rejects.toThrow("No data");
    });

    it("should throw when response data has no nested data", async () => {
      mockedAxios.post.mockResolvedValue({ data: { errors: ["bad query"] } });

      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      await expect(
        client.query("{ users { id } }", "http://subgraph")
      ).rejects.toThrow("No data");

      expect(consoleSpy).toHaveBeenCalledWith(["bad query"]);
      consoleSpy.mockRestore();
    });

    it("should log debug info when debug is enabled", async () => {
      const debugClient = new AxiosSubgraphClient(true);
      const mockData = { users: [] };
      mockedAxios.post.mockResolvedValue({ data: { data: mockData } });

      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      await debugClient.query("{ users { id } }", "http://subgraph");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("SUBGRAPH QUERY DEBUG")
      );
      consoleSpy.mockRestore();
    });
  });

  describe("queryPaginated", () => {
    it("should return all items from a single page", async () => {
      const items = [{ id: "1" }, { id: "2" }];
      mockedAxios.post.mockResolvedValue({
        data: { data: { users: items } },
      });

      const result = await client.queryPaginated(
        "{ users(skip: [[skip]]) { id } }",
        "users",
        "http://subgraph"
      );

      expect(result).toEqual(items);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith("http://subgraph", {
        query: "{ users(skip: 0) { id } }",
      });
    });

    it("should paginate across multiple pages", async () => {
      const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `${i}` }));
      const page2 = [{ id: "1000" }, { id: "1001" }];

      mockedAxios.post
        .mockResolvedValueOnce({ data: { data: { users: page1 } } })
        .mockResolvedValueOnce({ data: { data: { users: page2 } } });

      const result = await client.queryPaginated(
        "{ users(skip: [[skip]]) { id } }",
        "users",
        "http://subgraph"
      );

      expect(result).toHaveLength(1002);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(mockedAxios.post).toHaveBeenNthCalledWith(2, "http://subgraph", {
        query: "{ users(skip: 1000) { id } }",
      });
    });

    it("should return empty array when no results", async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { users: [] } },
      });

      const result = await client.queryPaginated(
        "{ users(skip: [[skip]]) { id } }",
        "users",
        "http://subgraph"
      );

      expect(result).toEqual([]);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
