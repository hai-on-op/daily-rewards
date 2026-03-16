import { AxiosSubgraphClient } from "../../infrastructure/subgraph/AxiosSubgraphClient";

const defaultClient = new AxiosSubgraphClient();

export const subgraphQuery = (query: string, url: string): Promise<any> =>
  defaultClient.query(query, url);

export const subgraphQueryPaginated = (
  query: string,
  paginatedField: string,
  url: string
): Promise<any> => defaultClient.queryPaginated(query, paginatedField, url);
