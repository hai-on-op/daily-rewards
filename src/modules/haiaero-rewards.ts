import { UserList } from "../types";
import {
  getRawHaiaeroCollateralData,
  processHaiaeroCollateral,
} from "../services/initial-data/getInitialHaiaeroState";
import {
  processRewardEvents,
  CollateralDebugEvent,
} from "../services/rewards/haiVeloRewardEventProcessor";
import { HaiveloCollateralEvent } from "../services/initial-data/getInitialHaiveloState";
import { config } from "../config";

type RewardCalculatorOptions = {
  startBlock: number;
  endBlock: number;
};

export type HaiaeroDebugData = {
  meta: {
    window: { startBlock: number; endBlock: number };
    rewardAmount: number;
    collateralTypeIds: string[];
    totalCollateralEvents: number;
    initialEventsCount: number;
    processingEventsCount: number;
    totalUsers: number;
    totalRewardsDistributed: number;
  };
  initialState: {
    users: Array<{
      address: string;
      collateral: number;
      stakingWeight: number;
    }>;
  };
  collateralEvents: Array<{
    address: string;
    deltaCollateral: number;
    createdAt: string;
    createdAtBlock: string;
  }>;
  events: CollateralDebugEvent[];
};

/**
 * Calculate haiAERO rewards based on collateral deposits.
 *
 * This is a simplified version of calculateHaiveloRewards (no LP staking).
 * Uses the same time-weighted reward processor (processRewardEvents) from
 * haiVeloRewardEventProcessor.ts.
 *
 * When debug=true, returns detailed debug data alongside the user rewards.
 */
export const calculateHaiaeroRewards = async (
  rewardAmount: number,
  options?: RewardCalculatorOptions,
  debug?: boolean
): Promise<{ users: UserList; debugData?: HaiaeroDebugData }> => {
  const REWARD_AMOUNT = rewardAmount;

  const {
    startBlock = config().HAIAERO_START_BLOCK,
    endBlock = config().HAIAERO_END_BLOCK,
  } = options
    ? options
    : {
        startBlock: config().HAIAERO_START_BLOCK,
        endBlock: config().HAIAERO_END_BLOCK,
      };

  console.log(`Calculating haiAERO rewards from block ${startBlock} to ${endBlock}`);

  // Fetch haiAERO collateral events
  const haiaeroEvents = await getRawHaiaeroCollateralData();
  console.log(`Fetched ${haiaeroEvents.length} haiAERO collateral events`);

  // Filter collateral events
  const initialCollateralEvents = haiaeroEvents
    .filter((event) => Number(event.createdAtBlock) < startBlock)
    .sort((a, b) => Number(a.createdAtBlock) - Number(b.createdAtBlock));

  const processingCollateralEvents = haiaeroEvents.filter(
    (event) =>
      Number(event.createdAtBlock) >= startBlock &&
      Number(event.createdAtBlock) <= endBlock
  );

  // Process initial collateral state
  const initialUsers = processHaiaeroCollateral(initialCollateralEvents);

  // Snapshot initial state before processing (for debug)
  const initialStateSnapshot = debug
    ? Object.values(initialUsers).map((u) => ({
        address: u.address,
        collateral: u.collateral,
        stakingWeight: u.stakingWeight,
      }))
    : [];

  // Use the same time-weighted reward processor as haiVELO (collateral-only path)
  const { users, debugEvents } = await processRewardEvents(
    REWARD_AMOUNT,
    processingCollateralEvents,
    initialUsers,
    {
      startBlock,
      endBlock,
    },
    debug
  );

  if (debug && debugEvents) {
    const totalRewardsDistributed = Object.values(users).reduce(
      (acc, u) => acc + u.earned,
      0
    );

    const debugData: HaiaeroDebugData = {
      meta: {
        window: { startBlock, endBlock },
        rewardAmount: REWARD_AMOUNT,
        collateralTypeIds: config().HAIAERO_COLLATERAL_TYPE_IDS,
        totalCollateralEvents: haiaeroEvents.length,
        initialEventsCount: initialCollateralEvents.length,
        processingEventsCount: processingCollateralEvents.length,
        totalUsers: Object.keys(users).length,
        totalRewardsDistributed,
      },
      initialState: {
        users: initialStateSnapshot,
      },
      collateralEvents: processingCollateralEvents.map((e) => ({
        address: e.safe.owner.address,
        deltaCollateral: Number(e.deltaCollateral),
        createdAt: e.createdAt,
        createdAtBlock: e.createdAtBlock,
      })),
      events: debugEvents,
    };

    return { users, debugData };
  }

  return { users };
};

if (require.main === module) {
  calculateHaiaeroRewards(1000).then(({ users }) => {
    console.log("haiAERO rewards");
    console.log(users);
  });
}
