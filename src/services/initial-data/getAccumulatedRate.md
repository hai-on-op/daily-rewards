## Documentation

### Overview

The `getAccumulatedRate` module is responsible for retrieving the accumulated rate for a specific collateral type at a given block number. The accumulated rate is a crucial parameter in decentralized finance (DeFi) applications, often used to calculate the interest or fees accrued over time.

### Functions

#### 1. `buildAccumulatedRateQuery`

- **Purpose**: Constructs the GraphQL query required to fetch the accumulated rate from the subgraph.
- **Parameters**:
  - `block` (number): The block number at which to fetch the accumulated rate.
  - `cType` (string): The collateral type identifier (e.g., "ETH-A").
- **Returns**: A string representing the GraphQL query.

#### 2. `fetchAccumulatedRate`

- **Purpose**: Executes the GraphQL query against the subgraph to retrieve the accumulated rate data.
- **Parameters**:
  - `query` (string): The GraphQL query string.
  - `subgraphUrl` (string): The URL of the subgraph API.
- **Returns**: A promise that resolves to a `CollateralTypeResult` object containing the accumulated rate.

#### 3. `processAccumulatedRate`

- **Purpose**: Processes the fetched data to extract the accumulated rate value.
- **Parameters**:
  - `data` (CollateralTypeResult): The data fetched from the subgraph.
- **Returns**: The accumulated rate as a number.

#### 4. `getAccumulatedRate`

- **Purpose**: High-level function that orchestrates the fetching and processing of the accumulated rate.
- **Parameters**:
  - `block` (number): The block number at which to fetch the accumulated rate.
  - `cType` (string): The collateral type identifier.
  - `subgraphUrl` (string): The URL of the subgraph API.
- **Returns**: A promise that resolves to the accumulated rate as a number.

### Data Types

#### CollateralTypeResult

Represents the structure of the subgraph response for the accumulated rate.

- **Fields**:
  - `collateralType` (object):
    - `accumulatedRate` (string): The accumulated rate value as a string.

### Usage Example

```typescript
import { getAccumulatedRate } from "./getAccumulatedRate";

const block = 123456;
const cType = "ETH-A";
const subgraphUrl = "https://api.thegraph.com/subgraphs/name/your-subgraph";

(async () => {
  try {
    const accumulatedRate = await getAccumulatedRate(block, cType, subgraphUrl);
    console.log(
      `Accumulated Rate for ${cType} at block ${block}:`,
      accumulatedRate
    );
  } catch (error) {
    console.error("Error fetching accumulated rate:", error);
  }
})();
```

### Context About Accumulated Rate

- **Accumulated Rate**: In DeFi platforms like MakerDAO or GEB, the accumulated rate represents the compounded interest rate applied to a collateral type over time. It is used to calculate the debt of a vault (or safe) by multiplying the initial debt by the accumulated rate. This rate accrues over time due to stability fees or interest, reflecting the cost of borrowing against the collateral.
- **Collateral Type (`cType`)**: Different types of assets can be used as collateral in DeFi platforms. Each collateral type may have its own parameters, including stability fees and risk profiles. Examples include "ETH-A", "BAT-A", etc.

By fetching the accumulated rate at a specific block, developers can calculate historical debt positions, interest accrued, and perform accurate accounting or reward calculations.
