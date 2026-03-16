export interface ISubgraphClient {
  query<T = any>(query: string, url: string): Promise<T>;
  queryPaginated<T = any>(
    query: string,
    paginatedField: string,
    url: string
  ): Promise<T[]>;
}
