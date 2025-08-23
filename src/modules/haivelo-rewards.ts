import { UserList } from "../types";
import {
  getInitialHaiveloState,
  getRawHaiveloCollateralDataV1,
  getRawHaiveloCollateralDataV2,
  getRawHaiveloCollateralDataUnified,
  processHaiveloCollateral,
  VersionedHaiveloEvent,
} from "../services/initial-data/getInitialHaiveloState";
import { ethers } from "ethers";

import { processRewardEvents } from "../services/rewards/haiVeloRewardEventProcessor";
import { config } from "../config";

type RewardCalculatorOptions = {
  startBlock: number;
  endBlock: number;
};

export const calculateHaiveloRewards = async (
  rewardAmount: number,
  options?: RewardCalculatorOptions
): Promise<UserList> => {
  const REWARD_AMOUNT = rewardAmount;

  const {
    startBlock = config().LP_START_BLOCK,
    endBlock = config().LP_END_BLOCK,
  } = options
    ? options
    : {
        startBlock: config().LP_START_BLOCK,
        endBlock: config().LP_END_BLOCK,
      };

  const haiVeloEvents = await getRawHaiveloCollateralDataUnified();

  const initialEvents = haiVeloEvents
    .filter((event) => Number(event.createdAtBlock) < startBlock)
    .sort((a, b) => 1 * (Number(a.createdAtBlock) - Number(b.createdAtBlock)));

  const processingEvents = haiVeloEvents.filter(
    (event) =>
      Number(event.createdAtBlock) >= startBlock &&
      Number(event.createdAtBlock) <= endBlock
  );

  // Build combined initial state for denominator combined-mode
  const initialHaiveloUserCombined = processHaiveloCollateral(initialEvents as any);

  // Resolve split for this period (single range). If schedules are present, caller should segment periods; for now, use current default split.
  const cfg = config();
  const split = (cfg.HAIVELO_REWARD_SPLIT?.default ?? { v1: 1, v2: 0 }) as { v1: number; v2: number };

  // Prepare per-version streams
  const processingV1 = (processingEvents as VersionedHaiveloEvent[]).filter(e => e.__version === 'v1');
  const processingV2 = (processingEvents as VersionedHaiveloEvent[]).filter(e => e.__version === 'v2');

  const initialV1 = processHaiveloCollateral(initialEvents.filter((e: any) => e.__version === 'v1') as any);
  const initialV2 = processHaiveloCollateral(initialEvents.filter((e: any) => e.__version === 'v2') as any);

  // Calculate rewards per version with boost bias/cap and denominator mode
  const [usersV1, usersV2] = await Promise.all([
    processRewardEvents(
      REWARD_AMOUNT * (split.v1 ?? 0),
      processingV1 as any,
      initialV1,
      { startBlock, endBlock },
      {
        version: 'v1',
        denominatorMode: cfg.HAIVELO_BOOST_DENOMINATOR_MODE as any,
        denominatorUsers: initialHaiveloUserCombined,
      }
    ),
    processRewardEvents(
      REWARD_AMOUNT * (split.v2 ?? 0),
      processingV2 as any,
      initialV2,
      { startBlock, endBlock },
      {
        version: 'v2',
        denominatorMode: cfg.HAIVELO_BOOST_DENOMINATOR_MODE as any,
        denominatorUsers: initialHaiveloUserCombined,
      }
    ),
  ]);

  // Merge earned amounts across versions
  const merged: UserList = { ...usersV1 } as any;
  Object.entries(usersV2).forEach(([address, user]) => {
    if (merged[address]) {
      merged[address].earned += user.earned;
    } else {
      merged[address] = user;
    }
  });

  return merged;
};

if (require.main === module) {
  calculateHaiveloRewards(1000).then((rewards) => {
    console.log("rewards");
    console.log(rewards);
  });
}
