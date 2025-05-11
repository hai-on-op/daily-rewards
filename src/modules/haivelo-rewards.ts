import { UserList } from "../types";
import {
  getInitialHaiveloState,
  getRawHaiveloCollateralData,
  processHaiveloCollateral,
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

  const haiVeloEvents = await getRawHaiveloCollateralData();

  const initialEvents = haiVeloEvents
    .filter((event) => Number(event.createdAtBlock) < startBlock)
    .sort((a, b) => 1 * (Number(a.createdAtBlock) - Number(b.createdAtBlock)));

  const processingEvents = haiVeloEvents.filter(
    (event) =>
      Number(event.createdAtBlock) >= startBlock &&
      Number(event.createdAtBlock) <= endBlock
  );

  const initialHaiveloUser = processHaiveloCollateral(initialEvents);

  const users = processRewardEvents(
    REWARD_AMOUNT,
    processingEvents,
    initialHaiveloUser,
    {
      startBlock: startBlock,
      endBlock: endBlock,
    }
  );

  return users;
};

if (require.main === module) {
  calculateHaiveloRewards(1000).then((rewards) => {
    console.log("rewards");
    console.log(rewards);
  });
}
