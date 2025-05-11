import { config } from "../config";
import { getEvents } from "../services/get-events/lpGetEvents";
import { getInitialState } from "../services/initial-data/getInitialState";
import { getSafeOwnerMapping } from "../services/initial-data/getSafeOwnerMapping";
import { UserList } from "../types";
import { processRewardEvent } from "../services/rewards/lpRewardEventProcessor";
import path from "path";

type RewardCalculatorOptions = {
  startBlock: number;
  endBlock: number;
};

export const calculateLpRewards = async (
  rewardAmount: number,
  options?: RewardCalculatorOptions
) => {

  const {
    startBlock = config().LP_START_BLOCK,
    endBlock = config().LP_END_BLOCK,
  } = options
    ? options
    : {
        startBlock: config().LP_START_BLOCK,
        endBlock: config().LP_END_BLOCK,
      };


  const owners = await getSafeOwnerMapping(endBlock);

  // Load existing cache
  const cache = {}; // await cacheManager.loadAllCaches();
  console.log("Loaded cache from disk");

  console.log("config().LP_GEB_SUBGRAPH_URL", config().LP_GEB_SUBGRAPH_URL);

  const users: UserList = await getInitialState(
    startBlock,
    endBlock,
    owners,
    {
      type: "LP_REWARDS",
      withBridge: false,
    },
    config().LP_GEB_SUBGRAPH_URL
  );

  //console.log("users", users);

  const events = await getEvents(
    startBlock,
    endBlock,
    owners
  );

  return await processRewardEvent(rewardAmount, users, events, {
    startBlock,
    endBlock
  });
};

if (require.main === module) {
  calculateLpRewards(500).then((res) => {
    //console.log(res);
  });
}
