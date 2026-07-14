import Axios from "axios";
import { ISubgraphClient } from "../../core/interfaces";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

const RETRYABLE_GRAPHQL_ERROR_PATTERNS = [
  /bad indexers/i,
  /indexing_error/i,
  /indexer[^;]*unavailable/i,
  /no attestation/i,
  /rate limit/i,
  /temporar(?:y|ily)/i,
  /timed? out/i,
  /too far behind/i,
];

class SubgraphResponseError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "SubgraphResponseError";
  }
}

function isRetryable(err: any): boolean {
  if (err instanceof SubgraphResponseError) return err.retryable;
  if (!err.response) return true; // network error / timeout
  const status = err.response.status;
  return status === 502 || status === 503 || status === 504 || status === 429;
}

function getGraphQlErrorMessages(errors: unknown): string[] {
  if (!Array.isArray(errors)) return [];

  return errors.map((error) => {
    if (typeof error === "string") return error;
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message;
    }
    return JSON.stringify(error);
  });
}

function redactSubgraphUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/");
    const apiIndex = segments.indexOf("api");
    const subgraphsIndex = segments.indexOf("subgraphs");
    if (apiIndex >= 0 && subgraphsIndex === apiIndex + 2) {
      segments[apiIndex + 1] = "<redacted>";
      parsed.pathname = segments.join("/");
    }
    parsed.search = "";
    return parsed.toString();
  } catch {
    return "<invalid subgraph URL>";
  }
}

export class AxiosSubgraphClient implements ISubgraphClient {
  private debug: boolean;

  constructor(debug?: boolean) {
    this.debug =
      debug ??
      (process.env.DEBUG_SUBGRAPH === "true" ||
        process.env.DEBUG_SUBGRAPH === "1");
  }

  private async executeWithRetry<T>(query: string, url: string): Promise<T> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await Axios.post(url, { query });
        const graphQlErrors = getGraphQlErrorMessages(response.data?.errors);

        if (graphQlErrors.length > 0) {
          const message = `Subgraph GraphQL error: ${graphQlErrors.join("; ")}`;
          const retryable = RETRYABLE_GRAPHQL_ERROR_PATTERNS.some((pattern) =>
            pattern.test(message)
          );
          throw new SubgraphResponseError(message, retryable);
        }

        if (!response.data || response.data.data === undefined || response.data.data === null) {
          throw new SubgraphResponseError(
            "Subgraph response did not contain data",
            false
          );
        }

        return response.data.data as T;
      } catch (err: any) {
        if (this.debug) {
          console.log("\n========== SUBGRAPH QUERY ERROR ==========");
          console.log("URL:", redactSubgraphUrl(url));
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
            `Subgraph query failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${err.message}. Retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (err instanceof SubgraphResponseError) throw err;

        const status = err.response?.status
          ? ` (HTTP ${err.response.status})`
          : "";
        throw new Error(`Subgraph request failed${status}: ${err.message}`);
      }
    }

    throw new Error("Subgraph query exhausted all retry attempts");
  }

  async query<T = any>(query: string, url: string): Promise<T> {
    if (this.debug) {
      console.log("\n========== SUBGRAPH QUERY DEBUG ==========");
      console.log("URL:", redactSubgraphUrl(url));
      console.log("Query:", query);
      console.log("===========================================\n");
    }

    return this.executeWithRetry<T>(query, url);
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
      const page = data[paginatedField];

      if (!Array.isArray(page)) {
        throw new Error(
          `Subgraph response field "${paginatedField}" is not an array`
        );
      }

      ret.push(...page);
      skip = page.length >= 1000 ? skip + 1000 : 0;
    } while (skip);

    return ret;
  }
}
