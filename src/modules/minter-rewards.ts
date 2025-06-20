import { config } from "../config";
import { getBridgeData } from "../services/bridge-data";
import { getBridgedTokensAtBlock } from "../services/bridge-data/getBridgedTokensAtBlock";
import { BridgedAmountsDetailed } from "../services/bridge-data/types";
import { getEvents } from "../services/get-events/minterGetEvents";
import { getInitialState } from "../services/initial-data/getInitialState";
import { getSafeOwnerMapping } from "../services/initial-data/getSafeOwnerMapping";
import { UserList } from "../types";
import { processRewardEvent } from "../services/rewards/minterRewardEventProcessor";

export const calculateMinterRewards = async (
  fromBlock: number,
  toBlock: number
) => {
  const owners = await getSafeOwnerMapping(config().END_BLOCK);

  const rewardTokens = Object.keys(config().rewards.minter.config);

  type FinalResult = Record<string, Record<string, UserList>>;

  let finalResult: FinalResult = {};

  for (let i = 0; i < rewardTokens.length; i++) {
    const rewardToken = rewardTokens[i];
    console.log("Calculating rewards for token: ", rewardToken);

    const collateralTypes = Object.keys(
      config().rewards.minter.config[rewardToken]
    );

    for (let j = 0; j < collateralTypes.length; j++) {
      const cType = collateralTypes[j];
      const rewardAmount = config().rewards.minter.config[rewardToken][cType];

      const usersListWithBridge: UserList = {};

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
          totalBridgedTokens: 0,
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

    return finalResult;
  }

  //const bridgedTokensAtBlock = getBridgedTokensAtBlock(
  //  bridgedData,
  //  "0x0556bdc524fcd2b8855eaacb1e10638b292a47a3",
  //  "apxETH",
  //  config().END_BLOCK
  //);
  //
  //console.log(bridgedTokensAtBlock, "bridgedTokensAtBlock");
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