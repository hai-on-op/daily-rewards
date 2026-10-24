import { CalculateRewardsStep } from '../CalculateRewardsStep';
import { combineResultsForDistribution } from '../../../result-combiner';
import { getEffectiveClaimedAmounts } from '../../../../services/claim-accounting';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
jest.mock('../../../result-combiner', () => ({ combineResultsForDistribution: jest.fn() }));
jest.mock('../../contractHelpers', () => ({ getTokenAddressMap: () => ({ HAI: '0x0000000000000000000000000000000000000004' }) }));
jest.mock('../../../../config', () => ({ config: () => ({ DISTRIBUTOR_SUBGRAPH_URL: 'mock://claims', CLAIM_ADJUSTMENTS_FILE: 'existing-adjustments.json' }) }));
jest.mock('../../../../services/claim-accounting', () => ({ ...jest.requireActual('../../../../services/claim-accounting'), getEffectiveClaimedAmounts: jest.fn() }));
const owner = '0x0000000000000000000000000000000000000001';
it('passes exact cumulative through existing incident-adjusted claims and produces valid distribution leaves', async () => {
  (combineResultsForDistribution as jest.Mock).mockResolvedValue({ cumulative: { HAI: [{ address: owner, earned: '1000000000000000000000001' }] }, aeroLedger: { version: 1 }, collectorBindings: { '10': '0x0000000000000000000000000000000000000003' }, tokenBindings: { HAI: { address: '0x0000000000000000000000000000000000000004', chainId: 10, decimals: 18 } } });
  (getEffectiveClaimedAmounts as jest.Mock).mockResolvedValue(new Map([[owner, '1000000000000000000000000']]));
  const result = await new CalculateRewardsStep().execute({ effectiveEntryCounter: 1, rewardDistributor: { address: '0x0000000000000000000000000000000000000003' }, provider: { getNetwork: async () => ({ chainId: 10 }) } } as any);
  expect(result.finalRewards!.HAI).toEqual([{ address: owner, earned: '1' }]);
  expect(getEffectiveClaimedAmounts).toHaveBeenCalledWith(expect.anything(), [owner], expect.objectContaining({ claimAdjustmentsFile: 'existing-adjustments.json' }));
  const tree = StandardMerkleTree.of(result.finalRewards!.HAI.map(r => [r.address, r.earned]), ['address', 'uint256']);
  expect(tree.verify(0, tree.getProof(0))).toBe(true);
});
it('refuses to publish a ledger funded to another recipient', async () => {
  (combineResultsForDistribution as jest.Mock).mockResolvedValue({ cumulative: {}, aeroLedger: { version: 1 }, collectorBindings: { '10': '0x0000000000000000000000000000000000000009' }, tokenBindings: { HAI: { address: '0x0000000000000000000000000000000000000004', chainId: 10, decimals: 18 } } });
  await expect(new CalculateRewardsStep().execute({ effectiveEntryCounter: 1, rewardDistributor: { address: '0x0000000000000000000000000000000000000003' }, provider: { getNetwork: async () => ({ chainId: 10 }) } } as any)).rejects.toThrow('funding recipient');
});
