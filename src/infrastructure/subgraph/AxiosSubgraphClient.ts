import Axios from "axios";
import { ISubgraphClient } from "../../core/interfaces";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

function isRetryable(err: any): boolean {
  if (!err.response) return true; // network error / timeout
  const status = err.response.status;
  return status === 502 || status === 503 || status === 504 || status === 429;
}

export class AxiosSubgraphClient implements ISubgraphClient {
  private debug: boolean;

  constructor(debug?: boolean) {
    this.debug =
      debug ??
      (process.env.DEBUG_SUBGRAPH === "true" ||
        process.env.DEBUG_SUBGRAPH === "1");
  }

  private async executeWithRetry(query: string, url: string): Promise<any> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await Axios.post(url, { query });
      } catch (err: any) {
        if (this.debug) {
          console.log("\n========== SUBGRAPH QUERY ERROR ==========");
          console.log("URL:", url);
          console.log("Query:", query);
          console.log("Error:", err.message);
          if (err.response) {
            console.log("Status:", err.response.status);
            console.log(
              "Response data:",
              JSON.stringify(err.response.data, null, 2)
            );
          }
          console.log("===========================================\n");
        }

        if (attempt < MAX_RETRIES && isRetryable(err)) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.log(
            `Subgraph query failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw Error("Error with subgraph query: " + err);
      }
    }
  }

  async query<T = any>(query: string, url: string): Promise<T> {
    if (this.debug) {
      console.log("\n========== SUBGRAPH QUERY DEBUG ==========");
      console.log("URL:", url);
      console.log("Query:", query);
      console.log("===========================================\n");
    }

    const resp = await this.executeWithRetry(query, url);

    if (!resp.data || !resp.data.data) {
      if (this.debug) {
        console.log("\n========== SUBGRAPH NO DATA ERROR ==========");
        console.log("URL:", url);
        console.log("Query:", query);
        console.log("Response:", JSON.stringify(resp.data, null, 2));
        console.log("============================================\n");
      }
      if (resp.data && resp.data.errors) {
        console.log(resp.data.errors);
      }
      throw Error("No data");
    }

    return resp.data.data;
  }

  async queryPaginated<T = any>(
    query: string,
    paginatedField: string,
    url: string
  ): Promise<T[]> {
    const ret: T[] = [];
    let skip = 0;
    do {
      const paginatedQuery = query.replace("[[skip]]", skip.toString());
      const data = await this.query<any>(paginatedQuery, url);

      ret.push(...data[paginatedField]);
      skip = data[paginatedField].length >= 1000 ? skip + 1000 : 0;
    } while (skip);

    return ret;
  }
}
