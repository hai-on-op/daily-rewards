import { config } from "../../config";
import { getAccumulatedRate } from "../initial-data/getAccumulatedRate";
import {
  LpPosition,
  LPRewardEvent,
  RewardEventType,
  UserAccount,
  UserList,
  Rates,
} from "../../types";
import { getOrCreateUser } from "../../utils/getOrCreateUser";
import { lpProvider } from "../../utils/chain";
import { sanityCheckAllUsers } from "../sanity-check/sanityCheck";
import { getStakingWeightForLPPositions } from "../staking-weights/getStakingWeight";
import { getPoolState } from "../pool-state/getPoolState";
import { getRedemptionPriceFromTimestamp } from "../redemption-price/getRedemptionPrice";
import * as fs from "fs";
import { get } from "http";
export const CTYPES = config().LP_COLLATERAL_TYPES;

export const processRewardEvent = async (
  rewardAmount: number,
  users: UserList,
  events: LPRewardEvent[]
): Promise<UserList> => {
  // Starting and ending of the campaign
  const startBlock = config().LP_START_BLOCK;
  const endBlock = config().LP_END_BLOCK;
  const startTimestamp = (await lpProvider.getBlock(startBlock)).timestamp;
  const endTimestamp = (await lpProvider.getBlock(endBlock)).timestamp;
  // Constant amount of reward distributed per second
  const rewardRate = rewardAmount / (endTimestamp - startTimestamp);
  // Ongoing Total supply of weight
  let totalStakingWeight = sumAllWeights(users);
  console.log(`Total staking weight: ${totalStakingWeight}`);
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
    const cTypeRate = await getAccumulatedRate(startBlock, cType, config().LP_GEB_SUBGRAPH_URL);
    rates[cType] = cTypeRate;
  }
  // Ongoing uni v3 sqrtPrice
  let sqrtPrice: string | number = (
    await getPoolState(
      startBlock,
      config().UNISWAP_POOL_ADDRESS,
      config().UNISWAP_SUBGRAPH_URL
    )
  ).sqrtPrice;
  // Ongoing redemption price
  let redemptionPrice: number = 1; // Initialize with default value
  let redemptionPriceLastUpdate = 0;
  // ===== Main processing loop ======
  console.log(
    `Distributing ${rewardAmount} at a reward rate of ${rewardRate}/sec between ${startTimestamp} and ${endTimestamp}`
  );
  console.log("Applying all events...");
  // Main processing loop processing events in chronologic order that modify the current reward rate distribution for each user.
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (i % 1000 === 0 && i > 0) console.log(`  Processed ${i} events`);
    // Update the redemption price, only async task in this processing loop
    if (redemptionPriceLastUpdate + 3600 * 24 <= event.timestamp) {
      redemptionPrice = await getRedemptionPriceFromTimestamp(event.timestamp);
      redemptionPriceLastUpdate = event.timestamp;
    }
    updateRewardPerWeight(event.timestamp);
    // Increment time
    timestamp = event.timestamp;
    // The way the rewards are credited is different for each event type
    switch (event.type) {
      case RewardEventType.DELTA_DEBT: {
        const [__, user] = getOrCreateUser(event.address ?? "", users);
        earn(user, rewardPerWeight);
        const accumulatedRate = rates[event.cType as string];
        // Convert to real debt after interests and update the debt balance
        const adjustedDeltaDebt = (event.value as number) * accumulatedRate;
        user.debt += adjustedDeltaDebt;
        // Ignore Dusty debt
        if (user.debt < 0 && user.debt > -0.4) {
          user.debt = 0;
        }
        user.stakingWeight = getStakingWeightForLPPositions(user.lpPositions);
        break;
      }
      case RewardEventType.POOL_POSITION_UPDATE: {
        const updatedPosition = event.value as LpPosition;
        const [__, user] = getOrCreateUser(event.address ?? "", users);
        earn(user, rewardPerWeight);
        // Detect the special of a simple NFT transfer (not form a mint/burn/modify position)
        for (let u of Object.keys(users)) {
          for (let p in users[u].lpPositions) {
            if (
              users[u].lpPositions[p].tokenId === updatedPosition.tokenId &&
              u !== event.address
            ) {
              console.log("ERC721 transfer");
              // We found the source address of an ERC721 transfer
              earn(users[u], rewardPerWeight);
              users[u].lpPositions = users[u].lpPositions.filter(
                (x) => x.tokenId !== updatedPosition.tokenId
              );
              user.stakingWeight = getStakingWeightForLPPositions(
                user.lpPositions
              );
            }
          }
        }
        // Create or update the position
        const index = user.lpPositions.findIndex(
          (p) => p.tokenId === updatedPosition.tokenId
        );
        if (index === -1) {
          user.lpPositions.push({
            tokenId: updatedPosition.tokenId,
            lowerTick: updatedPosition.lowerTick,
            upperTick: updatedPosition.upperTick,
            liquidity: updatedPosition.liquidity,
          });
        } else {
          user.lpPositions[index].liquidity = updatedPosition.liquidity;
          // Sanity check
          if (
            user.lpPositions[index].lowerTick !== updatedPosition.lowerTick ||
            user.lpPositions[index].upperTick !== updatedPosition.upperTick
          ) {
            throw Error("Tick value can't be updated");
          }
        }
        // Update that user staking weight
        user.stakingWeight = getStakingWeightForLPPositions(user.lpPositions);
        break;
      }
      case RewardEventType.POOL_SWAP: {
        // Pool swap changes the price which affects everyone's staking weight
        // First credit all users
        Object.values(users).map((u) => earn(u, rewardPerWeight));
        sqrtPrice = event.value as number;
        // Then update everyone weight
        Object.values(users).map(
          (u) =>
            (u.stakingWeight = getStakingWeightForLPPositions(u.lpPositions))
        );
        break;
      }
      case RewardEventType.UPDATE_ACCUMULATED_RATE: {
        // Update accumulated rate increases everyone's debt by the rate multiplier
        const rateMultiplier = event.value as number;
        const cTypeRate = rates[event.cType as string];
        rates[event.cType as string] = cTypeRate + rateMultiplier;
        // First credit all users
        Object.values(users).map((u) => earn(u, rewardPerWeight));
        // Update everyone's debt
        Object.values(users).map((u) => (u.debt *= rateMultiplier + 1));
        Object.values(users).map(
          (u) =>
            (u.stakingWeight = getStakingWeightForLPPositions(u.lpPositions))
        );
        break;
      }
      default:
        throw Error("Unknown event");
    }
    // sanityCheckAllUsers(users, event);
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
  Object.values(users).reduce((acc, user) => acc + user.stakingWeight, 0);
