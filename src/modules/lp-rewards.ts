import { config } from "../config";
import { getEvents } from "../services/get-events/lpGetEvents";
import { getInitialState } from "../services/initial-data/getInitialState";
import { getSafeOwnerMapping } from "../services/initial-data/getSafeOwnerMapping";
import { UserList } from "../types";

export const calculateLpRewards = async () => {
  const owners = await getSafeOwnerMapping(config().END_BLOCK);

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
    owners
  );
};
