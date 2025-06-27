import { BridgedAmountsDetailed } from '../services/bridge-data/types';
import { getEvents } from '../services/get-events/minterGetEvents';
import { getInitialState } from '../services/initial-data/getInitialState';
import { getSafeOwnerMapping } from '../services/initial-data/getSafeOwnerMapping';
import { UserList } from '../types';
import { processRewardEvent } from '../services/rewards/minterRewardEventProcessor';
import { config } from '../config';
import { minterProvider } from '../utils/chain';

export const calculateMinterRewards = async (
  fromBlock: number,
  toBlock: number
) => {
  const minterSetupData = config().rewards.minter;

  const owners = await getSafeOwnerMapping(config().END_BLOCK);

  const rewardTokens = Object.keys(minterSetupData.config);

  type FinalResult = Record<string, Record<string, UserList>>;

  let finalResult: FinalResult = {};
  for (let i = 0; i < rewardTokens.length; i++) {
    const rewardToken = rewardTokens[i];
    const collateralTypes = Object.keys(minterSetupData.config[rewardToken]);

    for (let j = 0; j < collateralTypes.length; j++) {
      const cType = collateralTypes[j];

      const startBlock = config().MINTER_START_BLOCK;
      const endBlock = config().MINTER_END_BLOCK;
      const dailyRewardAmount = minterSetupData.config[rewardToken][cType];
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
