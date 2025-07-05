/**
 * Unit tests for claimed amounts factory
 */

import { createClaimedAmountsUseCases } from '../factory';
import { ClaimedAmountsUseCases } from '../use-cases';

// Mock the dependencies
jest.mock('../../subgraph/claimed-amounts-repository');
jest.mock('../claimed-amounts-service');
jest.mock('../use-cases');
jest.mock('../../../config');

describe('Claimed Amounts Factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create use cases instance', () => {
    const useCases = createClaimedAmountsUseCases();

    expect(useCases).toBeDefined();
    expect(useCases).toBeInstanceOf(ClaimedAmountsUseCases);
  });

  it('should create a new instance each time', () => {
    const useCases1 = createClaimedAmountsUseCases();
    const useCases2 = createClaimedAmountsUseCases();

    expect(useCases1).not.toBe(useCases2);
  });
});