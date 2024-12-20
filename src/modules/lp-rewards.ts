import { config } from "../config";
import { getEvents } from "../services/get-events/lpGetEvents";
import { getInitialState } from "../services/initial-data/getInitialState";
import { getSafeOwnerMapping } from "../services/initial-data/getSafeOwnerMapping";
import { UserList } from "../types";
import { processRewardEvent } from "../services/rewards/lpRewardEventProcessor";
import path from "path";

export const calculateLpRewards = async (rewardAmount: number) => {
  const owners = await getSafeOwnerMapping(config().END_BLOCK);

  // Load existing cache
  const cache = {}; // await cacheManager.loadAllCaches();
  console.log("Loaded cache from disk");

  console.log("config().LP_GEB_SUBGRAPH_URL", config().LP_GEB_SUBGRAPH_URL)

  const users: UserList = await getInitialState(
    config().LP_START_BLOCK,
    config().LP_END_BLOCK,
    owners,
    {
      type: "LP_REWARDS",
      withBridge: false,
    },
    config().LP_GEB_SUBGRAPH_URL
  );

  const events = await getEvents(
    config().LP_START_BLOCK,
    config().LP_END_BLOCK,
    owners
  );

  return await processRewardEvent(rewardAmount, users, events);
};


calculateLpRewards(500).then(res => {
  console.log(res)
})