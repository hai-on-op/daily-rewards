import { config } from "../../config";
import { getAccumulatedRate } from "../initial-data/getAccumulatedRate";
import {
  LpPosition,
  RewardEvent,
  RewardEventType,
  UserAccount,
  UserList,
  Rates,
} from "../../types";
import {
  getOrCreateUser,
  getOrCreateUserMutate,
} from "../../utils/getOrCreateUser";
import { minterProvider } from "../../utils/chain";
import { sanityCheckAllUsers } from "../sanity-check/sanityCheck";
import { getStakingWeightForDebt } from "../staking-weights/getStakingWeight";
import { getPoolState } from "../pool-state/getPoolState";
import { getRedemptionPriceFromTimestamp } from "../redemption-price/getRedemptionPrice";
import { getBridgedTokensAtBlock } from "../bridge-data/getBridgedTokensAtBlock";
import { BridgedAmountsDetailed } from "../bridge-data/types";

export const CTYPES = config().COLLATERAL_TYPES;

export const processRewardEvent = async (
  bridgedData: BridgedAmountsDetailed,
  users: UserList,
  events: RewardEvent[],
  rewardAmount: number,
  withBridge: boolean
): Promise<UserList> => {
  let usersList = users;

  // Starting and ending of the campaign
  const startBlock = config().MINTER_START_BLOCK;
  const endBlock = config().MINTER_END_BLOCK;
  const startTimestamp = (await minterProvider.getBlock(startBlock)).timestamp;
  const endTimestamp = (await minterProvider.getBlock(endBlock)).timestamp;

  // Constant amount of reward distributed per second
  const rewardRate = rewardAmount / (endTimestamp - startTimestamp);

  // Ongoing Total supply of weight
  let totalStakingWeight = sumAllWeights(users);

  // Ongoing cumulative reward per weight over time
  let rewardPerWeight = 0;

  let updateRewardPerWeight = (evtTime: number) => {
    if (totalStakingWeight > 0) {
      const deltaTime = evtTime - timestamp;
      rewardPerWeight += (deltaTime * rewardRate) / totalStakingWeight;
    }
  };

  // Ongoing time
  let timestamp = startTimestamp;

  // Ongoing accumulated rate
  const rates: Rates = {};
  for (let i = 0; i < CTYPES.length; i++) {
    const cType = CTYPES[i];
    const cTypeRate = await getAccumulatedRate(startBlock, cType, config().MINTER_GEB_SUBGRAPH_URL);
    rates[cType] = cTypeRate;
  }

  let redemptionPriceLastUpdate = 0;
  // ===== Main processing loop ======

  console.log(
    `Distributing ${rewardAmount}  at a reward rate of ${rewardRate}/sec between ${startTimestamp} and ${endTimestamp}`
  );
  console.log("Applying all events...");
  // Main processing loop processing events in chronologic order that modify the current reward rate distribution for each user.

  for (let i = 0; i < events.length; i++) {
    const event = events[i];


    if (i % 1000 === 0 && i > 0) console.log(`  Processed ${i} events`);

    updateRewardPerWeight(event.timestamp);

    const rewardsDistributed = rewardRate * (event.timestamp - startTimestamp);

    // Increment time
    timestamp = event.timestamp;

    // The way the rewards are credited is different for each event type
    switch (event.type) {
      case RewardEventType.DELTA_DEBT: {
        const user = getOrCreateUserMutate(event.address ?? "", users);

        earn(user, rewardPerWeight);

        user.totalBridgedTokens = getBridgedTokensAtBlock(
          bridgedData,
          String(event.address),
          String(event.cType),
          event.createdAtBlock
        );

        const accumulatedRate = rates[event.cType as string];

      //  console.log("event", event, user, rates, accumulatedRate)


        // Convert to real debt after interests and update the debt balance
        const adjustedDeltaDebt = (event.value as number) * accumulatedRate;
        user.debt += adjustedDeltaDebt;

        user.collateral += event.complementaryValue ?? 0;

        // Ignore Dusty debt
        if (user.debt < 0 && user.debt > -0.4) {
          user.debt = 0;
        }

        user.stakingWeight = getStakingWeightForDebt(
          user.debt,
          user.collateral,
          user.totalBridgedTokens,
          withBridge
        );

        break;
      }
      case RewardEventType.UPDATE_ACCUMULATED_RATE: {
        // Update accumulated rate increases everyone's debt by the rate multiplier
        const rateMultiplier = event.value as number;
        const cTypeRate = rates[event.cType as string];
        rates[event.cType as string] = cTypeRate + rateMultiplier;

        // setting user totalBridgedTokens
        Object.values(users).forEach(
          async (u) =>
            (u.totalBridgedTokens = getBridgedTokensAtBlock(
              bridgedData,
              String(u.address),
              String(event.cType),
              event.createdAtBlock
            ))
        );

        // First credit all users
        Object.values(users).map((u) => earn(u, rewardPerWeight));

        // Update everyone's debt
        Object.values(users).map((u) => (u.debt *= rateMultiplier + 1));

        Object.values(users).map((u) => {
          // calculating userEffectiveBridgedTokens
          const userEffectiveBridgedTokens = u.totalBridgedTokens; //- u.usedBridgedTokens;

          u.stakingWeight = getStakingWeightForDebt(
            u.debt,
            u.collateral,
            userEffectiveBridgedTokens,
            withBridge
          );
        });
        break;
      }
      default:
        throw Error("Unknown event");
    }

    sanityCheckAllUsers(users, event);

    // Individual user check, uncomment to create a report
    // const u = "0x00000...".toLowerCase()
    // earn(users[u], rewardPerWeight)
    // fs.appendFileSync("user.csv",`${new Date(timestamp * 1000).toISOString()},${users[u].debt},${users[u].lpPositions.reduce(
    //   (acc, p) => acc + getPositionSize(p, sqrtPrice, redemptionPrice),
    //   0
    // )},${users[u].stakingWeight},${totalStakingWeight},${users[u].earned}\n`)

    // Recalculate the sum of weights since the events the weights

    totalStakingWeight = sumAllWeights(users);
  }

  // Final crediting of all rewards
  updateRewardPerWeight(endTimestamp);
  Object.values(users).map((u) => earn(u, rewardPerWeight));

  return users;
};

// Credit reward to a user
const earn = (user: UserAccount, rewardPerWeight: number) => {
  // Credit to the user his due rewards
  user.earned +=
    (rewardPerWeight - user.rewardPerWeightStored) * user.stakingWeight;

  // Store his cumulative credited rewards for next time
  user.rewardPerWeightStored = rewardPerWeight;
};

// Simply sum all the stakingWeight of all users
const sumAllWeights = (users: UserList) =>
  Object.values(users).reduce((acc, user) => {
    return acc + user.stakingWeight;
  }, 0);
