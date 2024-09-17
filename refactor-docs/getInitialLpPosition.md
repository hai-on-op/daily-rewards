# Refactoring Plan for `getInitialLpPosition`

## Overview

### Purpose of `getInitialLpPosition`

The `getInitialLpPosition` function retrieves the initial positions of Liquidity Providers (LPs) in a Uniswap pool at a specific block number. It performs the following tasks:

1.  **Fetches LP Positions**: Retrieves LP token positions from the Uniswap subgraph at a given block number.
2.  **Processes Data**: Parses and organizes the fetched data into a structured format.
3.  **Returns User Positions**: Outputs an object mapping each LP's address to their respective positions.

### How It Works

1.  **Configuration Access**: Uses `config().UNISWAP_POOL_ADDRESS` to get the Uniswap pool address.
2.  **GraphQL Query Construction**: Builds a GraphQL query to fetch positions from the subgraph, filtered by the pool address and block number.
3.  **Data Retrieval**: Executes the query using `subgraphQueryPaginated` to handle pagination and fetch all relevant positions.
4.  **Data Transformation**:
    -   Parses string values to integers.
    -   Aggregates positions by owner address.
5.  **Result Formation**: Returns a `userPositions` object containing LPs and their positions.

## Refactoring Plan

### Objectives

-   **Enhance Readability**: Improve code clarity by modularizing functions.
-   **Increase Maintainability**: Simplify future updates and extensions.
-   **Apply SOLID Principles**: Adhere to best practices for software design.
-   **Facilitate Testing**: Make the code easily testable with unit tests.

### Applying SOLID Principles

1.  **Single Responsibility Principle (SRP)**:
    -   Separate the concerns of query building, data fetching, and data processing.
2.  **Open/Closed Principle (OCP)**:
    -   Design the function to be extendable without modifying existing code.
3.  **Liskov Substitution Principle (LSP)**:
    -   Ensure that components can be replaced with implementations that fulfill the same contract.
4.  **Interface Segregation Principle (ISP)**:
    -   Define clear interfaces for data structures and functions.
5.  **Dependency Inversion Principle (DIP)**:
    -   Depend on abstractions (interfaces), not on concrete implementations.

## Refactoring Strategy

### Steps to Refactor `getInitialLpPosition`

-   **Step 1: Inject Dependencies**
    
    -   Pass `poolAddress` and `subgraphUrl` as parameters instead of accessing them directly from the config.
    -   **Benefit**: Increases testability and adherence to DIP.
-   **Step 2: Extract Query Construction**
    
    -   Create a separate function `buildLpPositionsQuery` to construct the GraphQL query.
    -   **Benefit**: Follows SRP and makes the query reusable and testable.
-   **Step 3: Abstract Data Fetching**
    
    -   Use or create a generic data fetching function, e.g., `fetchData`.
    -   **Benefit**: Decouples data retrieval from processing logic.
-   **Step 4: Modularize Data Processing**
    
    -   Split the data processing into smaller functions like `parsePosition` and `aggregatePositions`.
    -   **Benefit**: Enhances readability and makes each function responsible for a single task.
-   **Step 5: Define Clear Interfaces**
    
    -   Use TypeScript interfaces to define data structures (`RawPosition`, `ProcessedPosition`, `UserPositions`).
    -   **Benefit**: Improves type safety and code self-documentation.
-   **Step 6: Implement Error Handling**
    
    -   Add error handling using try-catch blocks.
    -   **Benefit**: Makes the function more robust and easier to debug.
-   **Step 7: Remove Side Effects**
    
    -   Eliminate `console.log` statements or replace them with a logging mechanism that can be controlled externally.
    -   **Benefit**: Ensures the function has no unintended side effects.
-   **Step 8: Prepare for Unit Testing**
    
    -   Design functions to be easily testable by avoiding external dependencies within the function scope.
    -   **Benefit**: Facilitates writing comprehensive unit tests.

## Refactored Function Outline

### 1. Function Signature

```typescript
async function getInitialLpPosition( startBlock: number,
  poolAddress: string,
  subgraphUrl: string ): Promise<UserPositions> {
  // Implementation
}
```

### 2. Supporting Types


```typescript
   interface RawPosition {
      id: string;
      owner: string;
      liquidity: string;
      tickLower: {
        tickIdx: string;
      };
      tickUpper: {
        tickIdx: string;
      };
    }
    
    interface ProcessedPosition {
      lowerTick: number;
      upperTick: number;
      liquidity: number;
      tokenId: number;
    }
    
    interface UserPositions {
      [owner: string]: {
        positions: ProcessedPosition[];
      };
    }
```

### 3. Supporting Functions

#### `buildLpPositionsQuery`

Constructs the GraphQL query for fetching LP positions.

```typescript
function buildLpPositionsQuery(startBlock: number, poolAddress: string): string {
  return `
    {
      positions(
        block: { number: ${startBlock} },
        where: { pool: "${poolAddress}" },
        first: 1000,
        skip: [[skip]]
      ) {
        id
        owner
        liquidity
        tickLower { tickIdx }
        tickUpper { tickIdx }
      }
    }
  ;
}
``` 

#### `fetchLpPositions`

Fetches LP positions from the subgraph.

```typescript
async function fetchLpPositions( query: string,
  subgraphUrl: string ): Promise<RawPosition[]> {
  return await subgraphQueryPaginated(query, 'positions', subgraphUrl);
}
``` 

#### `processLpPositions`

Processes raw positions into a structured format.

```typescript
function processLpPositions(positions: RawPosition[]): UserPositions {
  return positions.reduce((acc, p) => {
    const processedPosition: ProcessedPosition = {
      lowerTick: parseInt(p.tickLower.tickIdx, 10),
      upperTick: parseInt(p.tickUpper.tickIdx, 10),
      liquidity: parseInt(p.liquidity, 10),
      tokenId: parseInt(p.id, 10),
    };

    if (acc[p.owner]) {
      acc[p.owner].positions.push(processedPosition);
    } else {
      acc[p.owner] = { positions: [processedPosition] };
    }
    return acc;
  }, {} as UserPositions);
}
```

### 4. Refactored `getInitialLpPosition`

```typescript
async function getInitialLpPosition( startBlock: number,
  poolAddress: string,
  subgraphUrl: string ): Promise<UserPositions> {
  // Build the query
  const query = buildLpPositionsQuery(startBlock, poolAddress);

  // Fetch raw positions
  const rawPositions = await fetchLpPositions(query, subgraphUrl);

  // Process positions
  const userPositions = processLpPositions(rawPositions);

  return userPositions;
}
```

## Unit Testing Plan

### Test Cases

#### `buildLpPositionsQuery`

-   **Test that the function returns the correct query string for given inputs.**
    -   Inputs: `startBlock`, `poolAddress`.
    -   Assert that the returned string matches the expected GraphQL query.

#### `fetchLpPositions`

-   **Test data fetching with mocked responses.**
    -   Mock the `subgraphQueryPaginated` function.
    -   Assert that the function returns the expected raw positions.

#### `processLpPositions`

-   **Test data processing with sample raw data.**
    -   Input: Array of `RawPosition` objects.
    -   Assert that the returned `UserPositions` object is correctly structured.

#### `getInitialLpPosition`

-   **Integration test combining all steps.**
    -   Mock dependencies (`fetchLpPositions` and `processLpPositions`).
    -   Assert that the function returns the correct final output.

## Refactoring Checklist

-   **Inject Dependencies**
    
    -   Replace direct config access with parameters for `poolAddress` and `subgraphUrl`.
-   **Separate Concerns**
    
    -   Extract query construction to `buildLpPositionsQuery`.
    -   Extract data fetching to `fetchLpPositions`.
    -   Extract data processing to `processLpPositions`.
-   **Define Interfaces**
    
    -   Create `RawPosition`, `ProcessedPosition`, and `UserPositions` interfaces.
    -   Use these interfaces consistently across functions.
-   **Implement Error Handling**
    
    -   Wrap asynchronous calls in try-catch blocks.
    -   Handle exceptions and provide meaningful error messages.
-   **Remove Side Effects**
    
    -   Eliminate `console.log` statements.
    -   Ensure function purity.
-   **Prepare for Unit Testing**
    
    -   Design functions to accept dependencies (e.g., pass in a logger if needed).
    -   Ensure functions are independent and testable in isolation.
-   **Write Unit Tests**
    
    -   Set up a testing framework (e.g., Jest).
    -   Write tests for each function with various scenarios.

## Conclusion

By refactoring `getInitialLpPosition` using SOLID principles, we achieve a modular, maintainable, and testable codebase. Each function now has a clear responsibility, dependencies are injected, and the overall design is more robust against future changes.

## Next Steps

-   **Implement Refactoring**: Follow the checklist to refactor the code.
-   **Set Up Testing Environment**: Ensure a testing framework is configured.
-   **Write Unit Tests**: Develop unit tests for each function.
-   **Code Review**: Peer-review the refactored code to catch any issues.
-   **Documentation**: Update project documentation to reflect changes