## Documentation

### Overview

The `getInitialLpPosition` module is responsible for retrieving and processing the initial positions of Liquidity Providers (LPs) in a Uniswap pool at a specific block number. This data is essential for calculating rewards and understanding the state of LPs in the pool.

### Functions

#### 1. `buildLpPositionsQuery`

- **Purpose**: Constructs the GraphQL query required to fetch LP positions from the subgraph.
- **Parameters**:
  - `startBlock` (number): The block number at which to fetch positions.
  - `poolAddress` (string): The address of the Uniswap pool.
- **Returns**: A string representing the GraphQL query.

#### 2. `fetchLpPositions`

- **Purpose**: Executes the GraphQL query against the subgraph to retrieve raw LP positions.
- **Parameters**:
  - `query` (string): The GraphQL query string.
  - `subgraphUrl` (string): The URL of the subgraph API.
- **Returns**: A promise that resolves to an array of `RawPosition` objects.

#### 3. `processLpPositions`

- **Purpose**: Processes the raw LP positions into a structured format grouped by user addresses.
- **Parameters**:
  - `positions` (RawPosition[]): An array of raw LP positions.
- **Returns**: An object (`UserPositions`) mapping user addresses to their processed positions.

#### 4. `getInitialLpPosition`

- **Purpose**: High-level function that orchestrates the fetching and processing of LP positions.
- **Parameters**:
  - `startBlock` (number): The block number at which to fetch positions.
  - `poolAddress` (string): The address of the Uniswap pool.
  - `subgraphUrl` (string): The URL of the subgraph API.
- **Returns**: A promise that resolves to `UserPositions`.

### Data Types

#### RawPosition

Represents the raw data returned from the subgraph.

- **Fields**:
  - `id` (string): The unique identifier of the position.
  - `owner` (string): The Ethereum address of the liquidity provider.
  - `liquidity` (string): The amount of liquidity provided by the user in this position.
  - `tickLower` (object):
    - `tickIdx` (string): The lower bound tick index of the price range.
  - `tickUpper` (object):
    - `tickIdx` (string): The upper bound tick index of the price range.

**Context**:

- **Liquidity**: In Uniswap V3, liquidity refers to the amount of funds that a liquidity provider has deposited into a pool within a specific price range. It is a crucial metric that determines the share of fees the LP earns from trades occurring within their specified range.
- **tickLower** and **tickUpper**: Uniswap V3 allows LPs to concentrate their liquidity within custom price ranges. The price range is defined by `tickLower` and `tickUpper`, which are indices representing specific price points in the pool. Each tick corresponds to a price, and ticks are spaced at discrete intervals determined by the pool's fee tier. By setting these bounds, LPs can optimize their capital efficiency and potentially earn more fees when trades occur within their specified range.

#### ProcessedPosition

Represents the processed LP position with parsed numeric values.

- **Fields**:
  - `lowerTick` (number): The lower bound tick index as an integer.
  - `upperTick` (number): The upper bound tick index as an integer.
  - `liquidity` (number): The liquidity amount as an integer.
  - `tokenId` (number): The unique identifier of the position as an integer.

#### UserPositions

Maps user addresses to their LP positions.

- **Structure**:
  - `[owner: string]`: An object containing:
    - `positions` (ProcessedPosition[]): An array of the user's processed positions.

### Usage Example

```typescript
import { getInitialLpPosition } from "./path/to/module";

const startBlock = 123456;
const poolAddress = "0xYourPoolAddress";
const subgraphUrl =
  "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3";

(async () => {
  try {
    const userPositions = await getInitialLpPosition(
      startBlock,
      poolAddress,
      subgraphUrl
    );
    console.log(userPositions);
  } catch (error) {
    console.error("Error fetching initial LP positions:", error);
  }
})();
```

### Testing

- The module includes comprehensive unit tests for each function.
- Tests can be run using a testing framework like Jest.
- To run the tests:
  - Ensure Jest is installed in your project.
  - Execute `npm test` or `yarn test` depending on your setup.

### Notes

- **Error Handling**: The module assumes that the subgraph API is reliable. In a production environment, additional error handling and retries might be necessary.
- **Dependencies**:
  - `subgraphQueryPaginated`: A utility function that handles paginated queries to the subgraph.
  - Type definitions for `UserPositions`, `RawPosition`, and `ProcessedPosition`.
