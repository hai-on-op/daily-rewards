## Documentation

### Overview

The `getPoolState` module is responsible for fetching the state of a Uniswap pool at a specific block number from the Uniswap subgraph. Specifically, it retrieves the `sqrtPrice`, which is a key parameter in Uniswap V3 used for price calculations and liquidity computations.

### Functions

#### 1. `buildPoolStateQuery`

-   **Purpose**: Constructs the GraphQL query required to fetch the pool state from the subgraph at a specific block.
-   **Parameters**:
    -   `block` (number): The block number at which to fetch the pool state.
    -   `poolId` (string): The ID of the Uniswap pool.
-   **Returns**: A string representing the GraphQL query.

#### 2. `fetchPoolState`

-   **Purpose**: Executes the GraphQL query against the subgraph to retrieve the pool state.
-   **Parameters**:
    -   `query` (string): The GraphQL query string.
    -   `subgraphUrl` (string): The URL of the Uniswap subgraph API.
-   **Returns**: A promise that resolves to a `PoolState` object containing the `sqrtPrice`.

#### 3. `getPoolState`

-   **Purpose**: High-level function that orchestrates the fetching of the pool state.
-   **Parameters**:
    -   `block` (number): The block number at which to fetch the pool state.
    -   `poolId` (string): The ID of the Uniswap pool.
    -   `subgraphUrl` (string): The URL of the Uniswap subgraph API.
-   **Returns**: A promise that resolves to a `PoolState` object.

### Data Types

#### `PoolState`

An interface representing the pool state fetched from the subgraph.

-   **Fields**:
    -   `sqrtPrice` (string): The square root of the current price in the pool, represented as a Q64.96 fixed-point number.

### Context and Explanation

#### **Understanding `sqrtPrice`**

-   **What is `sqrtPrice`?** In Uniswap V3, `sqrtPrice` represents the square root of the price ratio between the two tokens in the pool. It is used internally to compute the current price and for liquidity calculations.
-   **Why use `sqrtPrice`?** Using the square root of the price allows for more efficient and precise calculations when dealing with large numbers and fixed-point arithmetic.
-   **Data Format:** `sqrtPrice` is typically represented as a big integer in the Q64.96 fixed-point format, meaning it has 64 bits for the integer part and 96 bits for the fractional part.

#### **Fetching Data at a Specific Block**

-   **Block Parameter:** The function fetches the pool state at a specific block number, allowing for historical data retrieval.
-   **Use Cases:** This is crucial for applications that need to calculate historical liquidity, prices, or perform back-testing.

### Usage Example

```typescript
import { getPoolState } from './getPoolState';

const startBlock = 123456;
const poolId = '0xYourPoolAddress';
const subgraphUrl = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';

(async () => {
  try {
    const poolState = await getPoolState(startBlock, poolId, subgraphUrl);
    console.log(`Pool sqrtPrice at block ${startBlock}:`, poolState.sqrtPrice);
  } catch (error) {
    console.error('Error fetching pool state:', error);
  }
})();
``` 


### Additional Context

-   **Uniswap V3 Pools**: Uniswap V3 introduces concentrated liquidity, allowing liquidity providers to allocate liquidity within specific price ranges. The pool state, including `sqrtPrice`, is essential for calculating positions and understanding pool dynamics.
