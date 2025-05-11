import { UserList } from "../types";
import {
  getInitialHaiveloState,
  getRawHaiveloCollateralData,
  processHaiveloCollateral,
} from "../services/initial-data/getInitialHaiveloState";
import { ethers } from "ethers";

import { processRewardEvents } from "../services/rewards/haiVeloRewardEventProcessor";
import { config } from "../config";

export const calculateHaiveloRewards = async (
  rewardAmount: number
): Promise<UserList> => {
  const REWARD_AMOUNT = 1000;

  const haiVeloEvents = await getRawHaiveloCollateralData();

  const INITIAL_BLOCK = config().HAIVELO_START_BLOCK;

  const END_BLOCK = config().HAIVELO_END_BLOCK;

  const initialEvents = haiVeloEvents
    .filter((event) => Number(event.createdAtBlock) < INITIAL_BLOCK)
    .sort((a, b) => 1 * (Number(a.createdAtBlock) - Number(b.createdAtBlock)));

  //console.log(haiVeloEvents);

  const processingEvents = haiVeloEvents.filter(
    (event) =>
      Number(event.createdAtBlock) >= INITIAL_BLOCK &&
      Number(event.createdAtBlock) <= END_BLOCK
  );

  const initialHaiveloUser = processHaiveloCollateral(initialEvents);

  //console.log(initialHaiveloUser);

  const users = processRewardEvents(
    REWARD_AMOUNT,
    processingEvents,
    initialHaiveloUser
  );

  return users;
};

if (require.main === module) {
  calculateHaiveloRewards(1000).then((rewards) => {
    console.log("rewards");
    console.log(rewards);
  });
}
