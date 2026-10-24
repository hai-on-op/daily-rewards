import { combineResultsForDistribution, combineResults } from './result-combiner';
import { loadAeroRun } from '../core/rewards/aero/files';
import { getTokenTransfersToContract, getHaiaeroTokenTransfersToContract } from '../services/reward-distributor-deposits';
import { calculateHaiveloRewardsV2 } from './haivelo-rewards-v2';
import { calculateHaiaeroRewardsV2 } from './haiaero-rewards-v2';
jest.mock('../core/rewards/aero/files', () => ({ loadAeroRun: jest.fn() }));
jest.mock('../services/reward-distributor-deposits', () => ({ getTokenTransfersToContract: jest.fn(async () => []), getHaiaeroTokenTransfersToContract: jest.fn(async () => []) }));
jest.mock('./haivelo-rewards-v2', () => ({ calculateHaiveloRewardsV2: jest.fn() }));
jest.mock('./haiaero-rewards-v2', () => ({ calculateHaiaeroRewardsV2: jest.fn() }));
jest.mock('./lp-rewards-v2', () => ({ calculateLpRewardsV2: jest.fn() }));
jest.mock('./minter-rewards-v2', () => ({ calculateMinterRewardsV2: jest.fn(async () => ({ KITE: { HAI: { '0x0000000000000000000000000000000000000001': { earned: 2 } } } })) }));
jest.mock('./lp-staking-rewards-v2', () => ({ calculateLpStakingRewardsV2: jest.fn() }));
jest.mock('../config', () => ({ config: () => ({ HAIAERO_REWARDS_ENABLED: true, rewards: { lp: { historicConfig: {} }, lpStaking: { windows: [] } } }) }));
jest.mock('../services/reward-processor', () => ({ convertRewardsToBigNumber: jest.requireActual('../services/reward-processor').convertRewardsToBigNumber }));
const owner = '0x0000000000000000000000000000000000000001';
afterEach(() => { delete process.env.AERO_REWARDS_CONFIG_FILE; jest.clearAllMocks(); });
it('integrates exact Aero cumulative into distribution and does not call legacy transfer-based products', async () => {
  process.env.AERO_REWARDS_CONFIG_FILE = 'reviewed.json';
  (loadAeroRun as jest.Mock).mockResolvedValue({ input: { policy: { payoutTokens: {}, collectors: {} } }, ledger: { cumulative: { KITE: [{ address: owner, earned: '1000000000000000000000001' }] } } });
  const result = await combineResultsForDistribution();
  expect(result.cumulative.KITE).toEqual([{ address: owner, earned: '1000002000000000000000001' }]);
  expect(getTokenTransfersToContract).not.toHaveBeenCalled(); expect(getHaiaeroTokenTransfersToContract).not.toHaveBeenCalled();
  expect(calculateHaiveloRewardsV2).not.toHaveBeenCalled(); expect(calculateHaiaeroRewardsV2).not.toHaveBeenCalled();
  await expect(combineResults()).rejects.toThrow('exact cumulative');
});
it('keeps the existing legacy route when the feature is absent', async () => {
  const result = await combineResultsForDistribution();
  expect(loadAeroRun).not.toHaveBeenCalled(); expect(getTokenTransfersToContract).toHaveBeenCalled();
  expect(result.cumulative.KITE[0].earned).toBe('2000000000000000000');
});
it('does not fall back to legacy after invalid Aero input', async () => {
  process.env.AERO_REWARDS_CONFIG_FILE = 'bad.json'; (loadAeroRun as jest.Mock).mockRejectedValue(new Error('hash mismatch'));
  await expect(combineResultsForDistribution()).rejects.toThrow('hash mismatch'); expect(getTokenTransfersToContract).not.toHaveBeenCalled();
});
