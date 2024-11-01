import { config } from "../config";
import { getEvents } from "../services/get-events/lpGetEvents";
import { getInitialState } from "../services/initial-data/getInitialState";
import { getSafeOwnerMapping } from "../services/initial-data/getSafeOwnerMapping";
import { UserList } from "../types";
import {
  createWithBlockCache,
  BlockCache,
} from "../services/cache/withBlockCache";
import { processRewardEvent } from "../services/rewards/lpRewardEventProcessor";

export const calculateLpRewards = async () => {
  const owners = await getSafeOwnerMapping(config().END_BLOCK);

  // TODO: should be read from the file
  const cache: BlockCache = {};

  const withBlockCache = createWithBlockCache(cache);

  const users: UserList = await getInitialState(
    config().START_BLOCK,
    config().END_BLOCK,
    owners,
    {
      type: "LP_REWARDS",
      withBridge: false,
    }
  );

  const events = await getEvents(
    config().START_BLOCK,
    config().END_BLOCK,
    owners,
    withBlockCache
  );

  await processRewardEvent(users, events);

  //console.log(
  //  Object.values(users).filter((user) => !Number.isNaN(user.earned) && user.earned > 0)
  //);


  console.log(cache)

  // TODO: should store cache to the file
};
