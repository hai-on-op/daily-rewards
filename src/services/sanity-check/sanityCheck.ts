import { NULL_ADDRESS } from "../../config/constants";
import { provider } from "../../utils/chain";
import { LPRewardEvent, UserList } from "../../types";

export const finalSanityChecks = async (
  finalTimestamp: number,
  finalUsers: UserList,
  endBlock: number
) => {
  const endTimestamp = (await provider.getBlock(endBlock)).timestamp;
  if (finalTimestamp > endTimestamp) {
    throw Error("Impossible final timestamp");
  }

  // Check how much rewards were allocated
  const totalAllocatedReward = Object.values(finalUsers).reduce(
    (acc, a) => (acc += a.earned),
    0
  );
  console.log(
    `All events applied, total allocated reward ${totalAllocatedReward}`
  );
};

export const sanityCheckAllUsers = (users: UserList, event: LPRewardEvent) => {
  const numberCheck = (num: number) => !isFinite(num) || num < 0;


  if (event.address && event.address !== NULL_ADDRESS) {
    const usr = users[event.address];
    console.log(usr)

    if (
      numberCheck(usr.debt) ||
      numberCheck(usr.stakingWeight) ||
      numberCheck(usr.earned) ||
      numberCheck(usr.rewardPerWeightStored)
    ) {
      throw Error(
        `Invalid user:\n${JSON.stringify(usr)}\n at event:\n${JSON.stringify(
          event
        )}`
      );
    }

    for (let p of usr.lpPositions) {
      if (
        numberCheck(p.liquidity) ||
        !isFinite(p.lowerTick) ||
        !isFinite(p.upperTick)
      ) {
        throw Error(
          `Invalid user:\n${JSON.stringify(usr)}\n at event:\n${JSON.stringify(
            event
          )}`
        );
      }
    }
  }
};
