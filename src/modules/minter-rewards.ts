import { BridgedAmountsDetailed } from '../services/bridge-data/types';
import { getEvents } from '../services/get-events/minterGetEvents';
import { getInitialState } from '../services/initial-data/getInitialState';
import { getSafeOwnerMapping } from '../services/initial-data/getSafeOwnerMapping';
import { UserList } from '../types';
import { processRewardEvent } from '../services/rewards/minterRewardEventProcessor';
import { config } from '../config';
import { minterProvider } from '../utils/chain';
import { splitBlockRangeIntoPeriods, BlockPeriod } from '../utils/minter-config-resolver';
import { MinterRewardConfig } from '../config/types';

export const calculateMinterRewards = async (
  fromBlock: number,
  toBlock: number
) => {
  const minterSetupData = config().rewards.minter;

  console.log('--------------------------------');
  console.log('minterSetupData', minterSetupData);
  console.log('--------------------------------');

  // Check if time-based configuration is available
  if (minterSetupData.timedConfig) {
    console.log('Using time-based minter configuration');
    return await calculateTimedMinterRewards(fromBlock, toBlock, minterSetupData.timedConfig);
  } else {
    console.log('Using legacy minter configuration');
    return await calculateLegacyMinterRewards(fromBlock, toBlock, minterSetupData.config);
  }
};

/**
 * Calculate rewards using the new time-based configuration
 */
const calculateTimedMinterRewards = async (
  fromBlock: number,
  toBlock: number,
  timedConfig: any
) => {
  const periods = splitBlockRangeIntoPeriods(timedConfig, fromBlock, toBlock);
  
  if (periods.length === 0) {
    throw new Error(`No configuration found for block range ${fromBlock} to ${toBlock}`);
  }

  console.log(`Processing ${periods.length} time periods for blocks ${fromBlock} to ${toBlock}`);

  const owners = await getSafeOwnerMapping(toBlock);
  console.log('owners', owners);
  console.log('--------------------------------');

  type FinalResult = Record<string, Record<string, UserList>>;
  let finalResult: FinalResult = {};

  // Process each time period
  for (const period of periods) {
    console.log(`Processing period: blocks ${period.fromBlock} to ${period.toBlock}`);
    
    const periodResult = await calculatePeriodRewards(
      period.fromBlock,
      period.toBlock,
      period.config,
      owners
    );

    // Merge period results into final result
    mergePeriodResults(finalResult, periodResult);
  }

  return finalResult;
};

/**
 * Calculate rewards for a single time period
 */
const calculatePeriodRewards = async (
  fromBlock: number,
  toBlock: number,
  periodConfig: MinterRewardConfig,
  owners: any
): Promise<Record<string, Record<string, UserList>>> => {
  const rewardTokens = Object.keys(periodConfig);
  type PeriodResult = Record<string, Record<string, UserList>>;
  let periodResult: PeriodResult = {};

  for (let i = 0; i < rewardTokens.length; i++) {
    const rewardToken = rewardTokens[i];
    const collateralTypes = Object.keys(periodConfig[rewardToken]);

    for (let j = 0; j < collateralTypes.length; j++) {
      const cType = collateralTypes[j];

      const dailyRewardAmount = periodConfig[rewardToken][cType];
      const totalBlocks = toBlock - fromBlock + 1;
      const secsInDay = 86400;
      const opBlockTime = 2;
      const blocksInDay = Math.floor(secsInDay / opBlockTime);
      const perBlockRewardAmount = dailyRewardAmount / blocksInDay;
      const rewardAmount = perBlockRewardAmount * totalBlocks;

      const usersListWithBridge: UserList = {};

      const users: UserList = await getInitialState(
        fromBlock,
        toBlock,
        owners,
        {
          type: 'MINTER_REWARDS',
          withBridge: false
        },
        config().MINTER_GEB_SUBGRAPH_URL,
        cType
      );

      console.log(`Period users for ${rewardToken}/${cType}:`, users);
      console.log('--------------------------------');

      Object.values(users).forEach(async user => {
        usersListWithBridge[user.address] = {
          ...user,
          totalBridgedTokens: 0
        };
      });

      const events = await getEvents(
        fromBlock,
        toBlock,
        owners,
        cType
      );

      let usersListWithRewards = await processRewardEvent(
        [],
        usersListWithBridge,
        events,
        rewardAmount,
        false
      );

      if (!periodResult[rewardToken]) {
        periodResult[rewardToken] = {};
      }

      periodResult[rewardToken][cType] = usersListWithRewards;
    }
  }

  return periodResult;
};

/**
 * Merge rewards from multiple periods
 */
const mergePeriodResults = (
  finalResult: Record<string, Record<string, UserList>>,
  periodResult: Record<string, Record<string, UserList>>
) => {
  for (const rewardToken of Object.keys(periodResult)) {
    if (!finalResult[rewardToken]) {
      finalResult[rewardToken] = {};
    }

    for (const cType of Object.keys(periodResult[rewardToken])) {
      if (!finalResult[rewardToken][cType]) {
        finalResult[rewardToken][cType] = {};
      }

      // Merge user rewards
      const periodUsers = periodResult[rewardToken][cType];
      for (const userAddress of Object.keys(periodUsers)) {
        const periodUser = periodUsers[userAddress];
        
        if (finalResult[rewardToken][cType][userAddress]) {
          // User exists, add rewards
          const existingUser = finalResult[rewardToken][cType][userAddress];
          finalResult[rewardToken][cType][userAddress] = {
            ...existingUser,
            earned: existingUser.earned + periodUser.earned,
            totalBridgedTokens: existingUser.totalBridgedTokens + periodUser.totalBridgedTokens
          };
        } else {
          // New user, add directly
          finalResult[rewardToken][cType][userAddress] = { ...periodUser };
        }
      }
    }
  }
};

/**
 * Calculate rewards using the legacy configuration (backward compatibility)
 */
const calculateLegacyMinterRewards = async (
  fromBlock: number,
  toBlock: number,
  legacyConfig: MinterRewardConfig
) => {
  const owners = await getSafeOwnerMapping(config().MINTER_END_BLOCK);
  console.log('owners', owners);
  console.log('--------------------------------');

  const rewardTokens = Object.keys(legacyConfig);

  type FinalResult = Record<string, Record<string, UserList>>;

  let finalResult: FinalResult = {};
  for (let i = 0; i < rewardTokens.length; i++) {
    const rewardToken = rewardTokens[i];
    const collateralTypes = Object.keys(legacyConfig[rewardToken]);

    for (let j = 0; j < collateralTypes.length; j++) {
      const cType = collateralTypes[j];

      const startBlock = config().MINTER_START_BLOCK;
      const endBlock = config().MINTER_END_BLOCK;
      const dailyRewardAmount = legacyConfig[rewardToken][cType];
      const totalBlocks = endBlock - startBlock;
      const secsInDay = 86400;
      const opBlockTime = 2;
      const blocksInDay = Math.floor(secsInDay / opBlockTime);
      const perBlockRewardAmount = dailyRewardAmount / blocksInDay;
      const rewardAmount = perBlockRewardAmount * totalBlocks;

      const usersListWithBridge: UserList = {};

      const users: UserList = await getInitialState(
        config().MINTER_START_BLOCK,
        config().MINTER_END_BLOCK,
        owners,
        {
          type: 'MINTER_REWARDS',
          withBridge: false
        },
        config().MINTER_GEB_SUBGRAPH_URL,
        cType
      );

      console.log('users', users);
      console.log('--------------------------------');

      Object.values(users).forEach(async user => {
        usersListWithBridge[user.address] = {
          ...user,
          totalBridgedTokens: 0
        };
      });

      const events = await getEvents(
        config().MINTER_START_BLOCK,
        config().MINTER_END_BLOCK,
        owners,
        cType
      );

      let usersListWithRewards = await processRewardEvent(
        [],
        usersListWithBridge,
        events,
        rewardAmount,
        false
      );

      if (!finalResult[rewardToken]) {
        finalResult[rewardToken] = {};
      }

      finalResult[rewardToken][cType] = usersListWithRewards;
    }
  }

  return finalResult;
};

/*calculateMinterRewards(14461892, 21308720).then((rewards) => {
  console.log(
    rewards,
    //"Stones",
    //Object.entries(rewards["KITE"]["STONES"])
    //  .map(([address, value]) => ({
    //    address,
    //    earned: value.earned,
    //  }))
    //  .sort((a, b) => b.earned - a.earned),
    //"WETH",
    //Object.entries(rewards["KITE"]["WETH"])
    //  .map(([address, value]) => ({
    //    address,
    //    earned: value.earned,
    //  }))
    //  .sort((a, b) => b.earned - a.earned),
    //"TOTEM",
    Object.entries(rewards["DINERO"]["TOTEM"])
      .map(([address, value]) => ({
        address,
        earned: value.earned,
      }))
      .sort((a, b) => b.earned - a.earned)
  );
  console.log(rewards);
});*/

/**
 * 
 * 

  Legacy Bridge Code

 if (!config().IGNORE_BRIDGE) {
    const bridgedData = (await getBridgeData(
      { fromBlock: 0, toBlock },
      undefined,
      [...targetUserList]
    )) as BridgedAmountsDetailed;

    for (let i = 0; i < rewardTokens.length; i++) {
      let usersListWithBridge: UserList = {};

      const rewardToken = rewardTokens[i];
      console.log("Calculating rewards for token: ", rewardToken);

      const collateralTypes = Object.keys(
        config().rewards.minter.config[rewardToken]
      );

      for (let j = 0; j < collateralTypes.length; j++) {
        const cType = collateralTypes[j];
        const rewardAmount = config().rewards.minter.config[rewardToken][cType];

        const users: UserList = await getInitialState(
          config().MINTER_START_BLOCK,
          config().MINTER_END_BLOCK,
          owners,
          {
            type: "MINTER_REWARDS",
            withBridge: false,
          },
          config().MINTER_GEB_SUBGRAPH_URL,
          cType
        );

        Object.values(users).forEach(async (user) => {
          usersListWithBridge[user.address] = {
            ...user,
            totalBridgedTokens: getBridgedTokensAtBlock(
              bridgedData,
              user.address,
              cType,
              config().MINTER_START_BLOCK
            ),
          };
        });

        const events = await getEvents(
          config().MINTER_START_BLOCK,
          config().MINTER_END_BLOCK,
          owners,
          cType
        );

        let usersListWithRewards = await processRewardEvent(
          bridgedData,
          usersListWithBridge,
          events,
          rewardAmount,
          true
        );

        if (!finalResult[rewardToken]) {
          finalResult[rewardToken] = {};
        }

        finalResult[rewardToken][cType] = usersListWithRewards;
      }
    }

    return finalResult;
  } else {

 */
