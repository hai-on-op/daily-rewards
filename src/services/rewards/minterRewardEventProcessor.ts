import { config } from '../../config';
import { getAccumulatedRate } from '../initial-data/getAccumulatedRate';
import {
  LpPosition,
  RewardEvent,
  RewardEventType,
  UserAccount,
  UserList,
  Rates
} from '../../types';
import {
  getOrCreateUser,
  getOrCreateUserMutate
} from '../../utils/getOrCreateUser';
import { minterProvider } from '../../utils/chain';
import { sanityCheckAllUsers } from '../sanity-check/sanityCheck';
import { getStakingWeightForDebt } from '../staking-weights/getStakingWeight';
import { getPoolState } from '../pool-state/getPoolState';
import { getRedemptionPriceFromTimestamp } from '../redemption-price/getRedemptionPrice';
import { getBridgedTokensAtBlock } from '../bridge-data/getBridgedTokensAtBlock';
import { BridgedAmountsDetailed } from '../bridge-data/types';

export const CTYPES = config().COLLATERAL_TYPES;

type BoostAmounts = Record<string, number>;

type ProcessorOptions = {
  startBlock: number;
  endBlock: number;
};

export type MinterDebugEvent =
  | { type: 'init'; startTimestamp: number; endTimestamp: number; rewardRate: number }
  | { type: 'updateRewardPerWeight'; timestamp: number; rewardPerWeight: number; totalStakingWeight: number }
  | { type: 'userEarn'; address: string; deltaEarned: number; totalEarned: number; rewardPerWeight: number; boost: number; stakingWeight: number; timestamp: number }
  | { type: 'userWeightChange'; address: string; stakingWeight: number; debt: number; collateral: number; totalBridgedTokens: number; timestamp: number }
  | { type: 'updateAccumulatedRate'; cType: string; newRate: number; timestamp: number };

export const processRewardEvent = async (
  bridgedData: BridgedAmountsDetailed,
  users: UserList,
  events: RewardEvent[],
  rewardAmount: number,
  withBridge: boolean,
  options?: ProcessorOptions,
  debug?: boolean
): Promise<{ users: UserList; debugEvents?: MinterDebugEvent[] }> => {
  let usersList = users;
  const debugEvents: MinterDebugEvent[] = [];

  const {
    startBlock = config().MINTER_START_BLOCK,
    endBlock = config().MINTER_END_BLOCK
  } = options
    ? options
    : {
        startBlock: config().MINTER_START_BLOCK,
        endBlock: config().MINTER_END_BLOCK
      };

  // Starting and ending of the campaign
  const startTimestamp = (await minterProvider.getBlock(startBlock)).timestamp;
  const endTimestamp = (await minterProvider.getBlock(endBlock)).timestamp;

  // Constant amount of reward distributed per second
  const rewardRate = rewardAmount / (endTimestamp - startTimestamp);
  if (debug) debugEvents.push({ type: 'init', startTimestamp, endTimestamp, rewardRate });

  // Ongoing time
  let timestamp = startTimestamp;
  let cachedBoostAmounts: BoostAmounts | null = null;
  let lastBoostTimestamp = 0;

  const calculateUserMinterBoosts = (users: UserList): BoostAmounts => {
    // Only recalculate if boost state has changed
    if (cachedBoostAmounts && lastBoostTimestamp === timestamp) {
      return cachedBoostAmounts;
    }

    const totalDebt = Object.values(users).reduce(
      (acc, user) => acc + user.debt,
      0
    );

    cachedBoostAmounts = Object.entries(users).reduce((pV, [address, user]) => {
      const userDebt = user.debt;
      const userDebtShare = totalDebt > 0 ? userDebt / totalDebt : 0;

      return {
        ...pV,
        [address]: Math.min(userDebt > 0 ? userDebtShare + 1 : 1, 2)
      };
    }, {});
    lastBoostTimestamp = timestamp;
    return cachedBoostAmounts;
  };

  // Ongoing Total supply of weight
  let totalStakingWeight = sumAllWeights(
    users,
    calculateUserMinterBoosts(users)
  );

  // Ongoing cumulative reward per weight over time
  let rewardPerWeight = 0;

  let updateRewardPerWeight = (evtTime: number) => {
    if (totalStakingWeight > 0) {
      const deltaTime = evtTime - timestamp;
      rewardPerWeight += (deltaTime * rewardRate) / totalStakingWeight;
    }
    if (debug)
      debugEvents.push({
        type: 'updateRewardPerWeight',
        timestamp: evtTime,
        rewardPerWeight,
        totalStakingWeight
      });
  };

  // Ongoing accumulated rate
  const rates: Rates = {};
  for (let i = 0; i < CTYPES.length; i++) {
    const cType = CTYPES[i];
    const cTypeRate = await getAccumulatedRate(
      startBlock,
      cType,
      config().MINTER_GEB_SUBGRAPH_URL
    );
    rates[cType] = cTypeRate;
  }

  let redemptionPriceLastUpdate = 0;
  // ===== Main processing loop ======

  console.log(
    `Distributing ${rewardAmount}  at a reward rate of ${rewardRate}/sec between ${startTimestamp} and ${endTimestamp}`
  );
  console.log('Applying all events...');
  // Main processing loop processing events in chronologic order that modify the current reward rate distribution for each user.

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    console.log('event ===>', event);

    if (i % 1000 === 0 && i > 0) console.log(`  Processed ${i} events`);

    updateRewardPerWeight(event.timestamp);

    const rewardsDistributed = rewardRate * (event.timestamp - startTimestamp);

    // Increment time
    timestamp = event.timestamp;

    // The way the rewards are credited is different for each event type
    switch (event.type) {
      case RewardEventType.DELTA_DEBT: {
        const user = getOrCreateUserMutate(event.address ?? '', users);
        const boostAmounts = calculateUserMinterBoosts(users);
        const beforeEarn = user.earned;
        earn(user, rewardPerWeight, boostAmounts);
        if (debug)
          debugEvents.push({
            type: 'userEarn',
            address: user.address,
            deltaEarned: user.earned - beforeEarn,
            totalEarned: user.earned,
            rewardPerWeight,
            boost: boostAmounts[user.address] ?? 1,
            stakingWeight: user.stakingWeight,
            timestamp
          });

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
        if (debug)
          debugEvents.push({
            type: 'userWeightChange',
            address: user.address,
            stakingWeight: user.stakingWeight,
            debt: user.debt,
            collateral: user.collateral,
            totalBridgedTokens: user.totalBridgedTokens,
            timestamp
          });

        break;
      }
      case RewardEventType.UPDATE_ACCUMULATED_RATE: {
        // Update accumulated rate increases everyone's debt by the rate multiplier
        const rateMultiplier = event.value as number;
        const cTypeRate = rates[event.cType as string];
        rates[event.cType as string] = cTypeRate + rateMultiplier;

        // setting user totalBridgedTokens
        Object.values(users).forEach(
          async u =>
            (u.totalBridgedTokens = getBridgedTokensAtBlock(
              bridgedData,
              String(u.address),
              String(event.cType),
              event.createdAtBlock
            ))
        );

        const boostAmounts = calculateUserMinterBoosts(users);
        // First credit all users
        Object.values(users).map(u => {
          const prev = u.earned;
          earn(u, rewardPerWeight, boostAmounts);
          if (debug)
            debugEvents.push({
              type: 'userEarn',
              address: u.address,
              deltaEarned: u.earned - prev,
              totalEarned: u.earned,
              rewardPerWeight,
              boost: boostAmounts[u.address] ?? 1,
              stakingWeight: u.stakingWeight,
              timestamp
            });
        });

        // Update everyone's debt
        Object.values(users).map(u => (u.debt *= rateMultiplier + 1));

        Object.values(users).map(u => {
          // calculating userEffectiveBridgedTokens
          const userEffectiveBridgedTokens = u.totalBridgedTokens; //- u.usedBridgedTokens;

          u.stakingWeight = getStakingWeightForDebt(
            u.debt,
            u.collateral,
            userEffectiveBridgedTokens,
            withBridge
          );
          if (debug)
            debugEvents.push({
              type: 'userWeightChange',
              address: u.address,
              stakingWeight: u.stakingWeight,
              debt: u.debt,
              collateral: u.collateral,
              totalBridgedTokens: u.totalBridgedTokens,
              timestamp
            });
        });
        break;
      }
      default:
        throw Error('Unknown event');
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
    totalStakingWeight = sumAllWeights(users, calculateUserMinterBoosts(users));
  }

  console.log('Debugging event  ===> Before final crediting of all rewards');
  // Final crediting of all rewards
  updateRewardPerWeight(endTimestamp);
  Object.values(users).map(u => {
    const prev = u.earned;
    earn(u, rewardPerWeight, calculateUserMinterBoosts(users));
    if (debug)
      debugEvents.push({
        type: 'userEarn',
        address: u.address,
        deltaEarned: u.earned - prev,
        totalEarned: u.earned,
        rewardPerWeight,
        boost: 1,
        stakingWeight: u.stakingWeight,
        timestamp: endTimestamp
      });
  });

  return { users, debugEvents: debug ? debugEvents : undefined };
};

// Credit reward to a user
const earn = (
  user: UserAccount,
  rewardPerWeight: number,
  boostAmounts: BoostAmounts
) => {
  const boostAmount = boostAmounts[user.address] ?? 1;
  // Credit to the user his due rewards
  user.earned +=
    (rewardPerWeight - user.rewardPerWeightStored) *
    user.stakingWeight *
    boostAmount;
  // Store his cumulative credited rewards for next time
  user.rewardPerWeightStored = rewardPerWeight;
};

// Simply sum all the stakingWeight of all users
const sumAllWeights = (users: UserList, boostAmounts: BoostAmounts) => {
  return Object.values(users).reduce((acc, user) => {
    const boostAmount = boostAmounts[user.address] ?? 1;
    return acc + user.stakingWeight * boostAmount;
  }, 0);
};
