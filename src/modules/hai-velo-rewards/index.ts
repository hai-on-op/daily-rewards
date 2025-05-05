import { config as appConfig } from '../../config';
import { fetchVeloDepositEvents } from './fetchers';
import { processUserDeposits, getSortedUserDeposits, calculateTotalDeposits } from './processors';
export * from './types';

export const config = {
  haiVeloSubgraphUrl: process.env.HAI_VELO_SUBGRAPH_URL || '',
};

// Re-export functions
export {
  fetchVeloDepositEvents,
  processUserDeposits,
  getSortedUserDeposits,
  calculateTotalDeposits
};

export default config; 