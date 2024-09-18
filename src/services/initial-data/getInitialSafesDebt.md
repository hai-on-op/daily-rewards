# Documentation

## Overview

### Purpose of `getInitialSafesDebt`

The `getInitialSafesDebt` module is responsible for retrieving and processing the initial debts of safes (vaults) from the subgraph at a specific block number. It calculates the adjusted debt by applying the accumulated rate for each collateral type. This is essential for accurately determining users' debt positions, which can be used for reward calculations or financial analysis.

### How It Works

1.  **Query Construction**: Builds a GraphQL query to fetch safes with debt greater than zero. If a collateral type (`cType`) is provided, the query filters safes by that collateral type.
2.  **Data Fetching**: Executes the query using `subgraphQueryPaginated` to retrieve all relevant safes, handling pagination as needed.
3.  **Accumulated Rate Retrieval**: Fetches the accumulated rates for each collateral type using the `getAccumulatedRate` function.
4.  **Data Processing**:

    - Iterates over the fetched safes.
    - Filters out safes whose handlers are not mapped to owners.
    - Calculates the adjusted debt by multiplying the raw debt with the accumulated rate of the collateral type.
    - Collects the processed debts into an array.

5.  **Return Value**: Returns an array of processed debts, each containing the owner's address and their adjusted debt.

## Functions

### 1. `buildSafesDebtQuery`

- **Purpose**: Constructs the GraphQL query to fetch safes with debt, optionally filtering by collateral type.
- **Parameters**:
  - `startBlock` (number): The block number at which to fetch safes.
  - `cType` (string | undefined): The collateral type identifier. If undefined, no collateral type filter is applied.
- **Returns**: A string representing the GraphQL query.

### 2. `fetchSafesDebt`

- **Purpose**: Fetches safes with debt from the subgraph using the provided query.
- **Parameters**:
  - `query` (string): The GraphQL query string.
  - `subgraphUrl` (string): The URL of the subgraph API.
- **Returns**: A promise that resolves to an array of `SafeDebt` objects.

### 3. `processSafesDebt`

- **Purpose**: Processes the fetched safes to calculate adjusted debts using accumulated rates.
- **Parameters**:
  - `debtsGraph` (SafeDebt[]): Array of safes with debt data.
  - `ownerMapping` (Map<string, string>): Map of safe handlers to owner addresses.
  - `startBlock` (number): The block number at which to fetch accumulated rates.
  - `collateralTypes` (string[]): Array of collateral types to consider.
  - `subgraphUrl` (string): The URL of the subgraph API.
- **Returns**: A promise that resolves to an array of `ProcessedDebt` objects.

### 4. `getInitialSafesDebt`

- **Purpose**: High-level function that orchestrates the fetching and processing of safes' debts.
- **Parameters**:
  - `startBlock` (number): The block number at which to fetch safes.
  - `ownerMapping` (Map<string, string>): Map of safe handlers to owner addresses.
  - `collateralTypes` (string[]): Array of collateral types to consider.
  - `subgraphUrl` (string): The URL of the subgraph API.
  - `cType` (string | undefined): Optional collateral type to filter safes.
- **Returns**: A promise that resolves to an array of `ProcessedDebt` objects.

## Data Types

### `SafeDebt`

Represents the raw data of a safe with debt from the subgraph.

- **Fields**:
  - `debt` (string): The raw debt amount as a string.
  - `safeHandler` (string): The address of the safe handler.
  - `collateralType` (object):
    - `id` (string): The identifier of the collateral type.

### `ProcessedDebt`

Represents the processed debt information for an owner.

- **Fields**:
  - `address` (string): The owner's address.
  - `debt` (number): The adjusted debt amount as a number.

## Usage Example

```typescript
import { getInitialSafesDebt } from "./getInitialSafesDebt";

const startBlock = 123456;
const ownerMapping = new Map<string, string>([
  ["handler1", "owner1"],
  ["handler2", "owner2"],
]);
const collateralTypes = ["ETH-A", "BAT-A"];
const subgraphUrl = "https://api.thegraph.com/subgraphs/name/your-subgraph";
const cType = "ETH-A";

(async () => {
  try {
    const debts = await getInitialSafesDebt(
      startBlock,
      ownerMapping,
      collateralTypes,
      subgraphUrl,
      cType
    );
    console.log("Processed Debts:", debts);
  } catch (error) {
    console.error("Error fetching initial safes debts:", error);
  }
})();
```
