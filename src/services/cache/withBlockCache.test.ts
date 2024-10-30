import { createWithBlockCache } from "./withBlockCache";

describe("createWithBlockCache", () => {
  // Mock cache object
  let cache: Record<string, { [block: number]: any }>;

  // Mock fetch function
  const mockFetch = jest.fn();

  // Create withBlockCache instance
  let withBlockCache: ReturnType<typeof createWithBlockCache>;

  beforeEach(() => {
    cache = {};
    mockFetch.mockClear();
    withBlockCache = createWithBlockCache(cache);
  });

  it("should fetch and cache new data", async () => {
    const mockData = [{ value: "test1" }, { value: "test2" }];
    mockFetch.mockResolvedValue(mockData);

    const cachedFetch = withBlockCache("test", mockFetch);
    const result = await cachedFetch(1, 2, "param1");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(1, 2, "param1");
    expect(result).toEqual(mockData);
    expect(cache["test-param1"][1]).toEqual(mockData[0]);
    expect(cache["test-param1"][2]).toEqual(mockData[1]);
  });

  it("should use cached data when available", async () => {
    const mockData = { value: "test" };
    cache["test-param1"] = {
      1: mockData,
    };

    const cachedFetch = withBlockCache("test", mockFetch);
    const result = await cachedFetch(1, 1, "param1");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual([mockData]);
  });

  it("should handle partial cache hits", async () => {
    const cachedData = { value: "cached" };
    const newData = [{ value: "new1" }, { value: "new2" }];

    cache["test-param1"] = {
      1: cachedData,
    };

    mockFetch.mockResolvedValue(newData);

    const cachedFetch = withBlockCache("test", mockFetch);
    const result = await cachedFetch(1, 3, "param1");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(2, 3, "param1");
    expect(result).toEqual([cachedData, ...newData]);
  });

  it("should handle different cache keys for different parameters", async () => {
    const mockData1 = [{ value: "test1" }];
    const mockData2 = [{ value: "test2" }];

    mockFetch.mockResolvedValueOnce(mockData1).mockResolvedValueOnce(mockData2);

    const cachedFetch = withBlockCache("test", mockFetch);

    await cachedFetch(1, 1, "param1");
    await cachedFetch(1, 1, "param2");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(cache["test-param1"][1]).toEqual(mockData1[0]);
    expect(cache["test-param2"][1]).toEqual(mockData2[0]);
  });

  it("should handle object parameters in cache key", async () => {
    const mockData = [{ value: "test" }];
    mockFetch.mockResolvedValue(mockData);

    const cachedFetch = withBlockCache("test", mockFetch);
    await cachedFetch(1, 1, { key: "value" });

    const expectedCacheKey = 'test-{"key":"value"}';
    expect(cache[expectedCacheKey]).toBeDefined();
    expect(cache[expectedCacheKey][1]).toEqual(mockData[0]);
  });

  it("should handle continuous block ranges", async () => {
    const mockData = [
      { value: "block1" },
      { value: "block2" },
      { value: "block3" },
    ];

    cache["test-param1"] = {
      1: mockData[0],
      2: mockData[1],
      3: mockData[2],
    };

    const cachedFetch = withBlockCache("test", mockFetch);
    const result = await cachedFetch(1, 3, "param1");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual(mockData);
  });

  it("should handle non-array fetch results", async () => {
    const singleItem = { value: "single" };
    mockFetch.mockResolvedValue(singleItem);

    const cachedFetch = withBlockCache("test", mockFetch);
    const result = await cachedFetch(1, 1, "param1");

    expect(result).toEqual([singleItem]);
    expect(cache["test-param1"][1]).toEqual(singleItem);
  });

  it("should optimize fetch calls for missing blocks", async () => {
    const mockData = [{ value: "test1" }, { value: "test2" }];
    mockFetch.mockResolvedValue(mockData);

    cache["test-param1"] = {
      1: { value: "cached1" },
      4: { value: "cached4" },
    };

    const cachedFetch = withBlockCache("test", mockFetch);
    await cachedFetch(1, 4, "param1");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(2, 3, "param1");
  });

  it("should handle errors in fetch function", async () => {
    mockFetch.mockRejectedValue(new Error("Fetch failed"));

    const cachedFetch = withBlockCache("test", mockFetch);
    await expect(cachedFetch(1, 1, "param1")).rejects.toThrow("Fetch failed");
  });

  it("should optimize fetch calls for missing blocks", async () => {
    const mockData = [
      [{ value: "test1" }, { value: "test3" }],
      [{ value: "test4", foo: "bar" }],
      [{ value: "test8", foo: "barzoo" }],
    ];
    mockFetch.mockResolvedValue(mockData);

    cache["test-param1"] = {
      1: { value: "cached1" },
      4: { value: "cached4" },
    };

    const cachedFetch = withBlockCache("test", mockFetch);
    const result =  await cachedFetch(1, 7, "param1");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith(2, 3, "param1");
    expect(mockFetch).toHaveBeenCalledWith(5, 7, "param1");

    console.log(cache, result)
  });
});
