/**
 * Factory for creating claimed amounts components
 */

import { SubgraphClaimedAmountsRepository } from '../subgraph/claimed-amounts-repository';
import { ClaimedAmountsService } from './claimed-amounts-service';
import { ClaimedAmountsUseCases } from './use-cases';

/**
 * Creates and wires together all claimed amounts components
 * @returns Configured use cases instance
 */
export function createClaimedAmountsUseCases(): ClaimedAmountsUseCases {
  const repository = new SubgraphClaimedAmountsRepository();
  const service = new ClaimedAmountsService(repository);
  const useCases = new ClaimedAmountsUseCases(service);
  
  return useCases;
} 