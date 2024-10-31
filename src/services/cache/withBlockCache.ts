export type BlockCache = Record<
  string,
  {
    [block: number]: any;
  }
>;

export type BlockFetchFunction<T, P extends any[]> = (
  startBlock: number,
  endBlock: number,
  ...args: P
) => Promise<T>;

export type WithBlockCache = <T, P extends any[]>(
  identifier: string,
  fn: BlockFetchFunction<T, P>
) => (
  startBlock: number,
  endBlock: number,
  ...args: P
) => Promise<T extends any[] ? T : T[]>;

export const createWithBlockCache = (cache: BlockCache) => {
  return <T, P extends any[]>(
    identifier: string,
    fn: BlockFetchFunction<T, P>
  ) => {
    return async (
      startBlock: number,
      endBlock: number,
      ...args: P
    ): Promise<T extends any[] ? T : T[]> => {
      // Create cache key that includes relevant parameters
      const cacheKey = `${identifier}-${args
        .map((arg) =>
          typeof arg === "object" ? JSON.stringify(arg) : String(arg)
        )
        .join("-")}`;

      // Initialize cache for this identifier if it doesn't exist
      if (!cache[cacheKey]) {
        cache[cacheKey] = {};
      }

      const results: T[] = [];
      let currentBlock = startBlock;

      while (currentBlock <= endBlock) {
        console.log(currentBlock);
        // Check if we have cached data for this block
        if (cache[cacheKey][currentBlock]) {
          // Find the longest continuous cached sequence
          let maxCachedBlock = currentBlock;
          while (
            cache[cacheKey][maxCachedBlock + 1] &&
            maxCachedBlock < endBlock
          ) {
            maxCachedBlock++;
          }

          // Add cached data to results
          for (let block = currentBlock; block <= maxCachedBlock; block++) {
            results.push(cache[cacheKey][block]);
          }

          currentBlock = maxCachedBlock + 1;
        } else {
          // Find the next cached block or end block
          let nextCachedBlock = currentBlock;
          while (
            !cache[cacheKey][nextCachedBlock] &&
            nextCachedBlock <= endBlock
          ) {
            nextCachedBlock++;
          }

          // Fetch missing data
          const fetchEndBlock = Math.min(nextCachedBlock - 1, endBlock);
          const fetchedData = await fn(currentBlock, fetchEndBlock, ...args);

          // Cache and add fetched data
          if (Array.isArray(fetchedData)) {
            fetchedData.forEach((item, index) => {
              const block = currentBlock + index;
              cache[cacheKey][block] = item;
              results.push(item);
            });
          } else {
            // Handle single item response
            cache[cacheKey][currentBlock] = fetchedData;
            results.push(
              ...(Array.isArray(fetchedData) ? fetchedData : [fetchedData])
            );
          }

          currentBlock = fetchEndBlock + 1;
        }
      }

      return results as T extends any[] ? T : T[];
    };
  };
};
