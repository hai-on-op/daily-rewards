# Claimed Amounts Module Documentation

## Overview

The **claimed-amounts** module is responsible for fetching, processing, and managing claimed reward amounts for users in a blockchain rewards distribution system. It is designed using a layered architecture for maintainability, testability, and separation of concerns.

---

## Table of Contents

1. [Functionality Description](#functionality-description)
2. [Module Structure](#module-structure)
   - [Domain Layer](#domain-layer)
   - [Repository Layer](#repository-layer)
   - [Service Layer](#service-layer)
   - [Use Cases (Application Layer)](#use-cases-application-layer)
   - [Integration Layer](#integration-layer)
3. [Testing Strategy](#testing-strategy)

---

## Functionality Description

The claimed-amounts module provides the following core functionalities:

- Fetches claimed reward amounts for users from a subgraph (blockchain indexer)
- Processes and aggregates claimed amounts for each user and token
- Filters out 'dust' (very small) amounts to avoid unnecessary transactions
- Provides a clean API for other modules to use claimed amounts data
- Handles errors gracefully and is fully testable with mocks

---

## Module Structure

### 1. Domain Layer

- **Why it exists:**
  - Defines the core business types and interfaces, independent of implementation details.
- **What it does:**
  - Provides type definitions for claimed amounts, queries, and results.
  - Defines the repository interface for fetching claimed amounts.
- **How it is tested:**
  - Types are validated through usage in service and repository tests.

**Files:**

- `src/domain/claimed-amounts/types.ts`
- `src/domain/claimed-amounts/repository.ts`
- `src/domain/claimed-amounts/index.ts`

---

### 2. Repository Layer

- **Why it exists:**
  - Abstracts data access, allowing the source of claimed amounts to be swapped or mocked.
- **What it does:**
  - Implements the repository interface using a subgraph query.
  - Normalizes addresses and handles subgraph response parsing.
- **How it is tested:**
  - Fully mocked in `claimed-amounts-repository.test.ts`.
  - Tests cover address normalization, error handling, and response parsing.

**Files:**

- `src/services/subgraph/claimed-amounts-repository.ts`
- `src/services/subgraph/__tests__/claimed-amounts-repository.test.ts`

---

### 3. Service Layer

- **Why it exists:**
  - Encapsulates business logic for processing claimed amounts.
- **What it does:**
  - Aggregates claimed amounts into a map for efficient lookup.
  - Handles error cases and provides a simple API for use cases.
- **How it is tested:**
  - Unit tested with a mocked repository in `claimed-amounts-service.test.ts`.
  - Tests cover normal operation, empty input, and error handling.

**Files:**

- `src/services/claimed-amounts/claimed-amounts-service.ts`
- `src/services/claimed-amounts/__tests__/claimed-amounts-service.test.ts`

---

### 4. Use Cases (Application Layer)

- **Why it exists:**
  - Provides high-level operations for the application, orchestrating service and repository logic.
- **What it does:**
  - Processes user rewards by subtracting claimed amounts and filtering out dust.
  - Calculates total claimed amounts for reporting or further processing.
- **How it is tested:**
  - Unit tested with a mocked service in `use-cases.test.ts`.
  - Tests cover reward processing, dust filtering, and error scenarios.

**Files:**

- `src/services/claimed-amounts/use-cases.ts`
- `src/services/claimed-amounts/__tests__/use-cases.test.ts`

---

### 5. Integration Layer

- **Why it exists:**
  - Ensures all layers work together as expected, simulating real-world usage.
- **What it does:**
  - Wires together repository, service, and use cases.
  - Provides a factory for easy instantiation in the application.
- **How it is tested:**
  - Integration tested with all dependencies mocked in `integration.test.ts`.
  - Tests cover the full flow from data fetching to reward processing.

**Files:**

- `src/services/claimed-amounts/factory.ts`
- `src/services/claimed-amounts/__tests__/integration.test.ts`

---

## Testing Strategy

- **Unit Tests:**
  - Each layer is tested in isolation with mocks for dependencies.
  - Error handling, edge cases, and business logic are covered.
- **Integration Tests:**
  - The full stack is tested with all layers wired together.
  - Mocks are used for external data sources (subgraph).
- **How to Run:**
  - Use the package script:
    ```bash
    npm run test:claimed-amounts
    ```
  - Or run individual test files with:
    ```bash
    npm test -- path/to/testfile.ts
    ```

---

## Summary

The claimed-amounts module is a robust, layered, and fully tested component of the rewards system. It is designed for easy maintenance, extensibility, and reliability, with clear separation of concerns and comprehensive test coverage at every layer.
