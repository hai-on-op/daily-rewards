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

  let usersAddresses = new Set<string>();

  type FinalResult = Record<string, Record<string, UserList>>;

  let finalResult: FinalResult = {};
  let usersListByRewardAndCollateralType: Record<
    string,
    Record<string, UserList>
  > = {};

  for (let i = 0; i < rewardTokens.length; i++) {
    const rewardToken = rewardTokens[i];
    console.log("Calculating rewards for token: ", rewardToken);

    const collateralTypes = Object.keys(
      config().rewards.minter.config[rewardToken]
    );

    for (let j = 0; j < collateralTypes.length; j++) {
      const cType = collateralTypes[j];

      console.log("Calculating rewards for collateral type: ", cType);

      const users: UserList = await getInitialState(
        config().START_BLOCK,
        config().END_BLOCK,
        owners,
        {
          type: "MINTER_REWARDS",
          withBridge: false,
        },
        cType
      );

      console.log(Object.keys(users).length, "users");

      Object.keys(users).forEach((userAddress) =>
        usersAddresses.add(userAddress.toLowerCase())
      );

      const events = await getEvents(
        config().START_BLOCK,
        config().END_BLOCK,
        owners,
        cType
      );

      events.forEach((event) => {
        if (event.address) {
          usersAddresses.add(event.address.toLowerCase());
        }
      });
    }
  }

  const targetUserList = usersAddresses; // ['0x5275817b74021e97c980e95ede6bbac0d0d6f3a2']

  let usersListWithBridge: UserList = {};

  const bridgedData = (await getBridgeData(
    { fromBlock: 0, toBlock },
    undefined,
    [...targetUserList]
  )) as BridgedAmountsDetailed;
  console.log(bridgedData, "bridgedData");

  //const bridgedTokensAtBlock = getBridgedTokensAtBlock(
  //  bridgedData,
  //  "0x0556bdc524fcd2b8855eaacb1e10638b292a47a3",
  //  "apxETH",
  //  config().END_BLOCK
  //);
  //
  //console.log(bridgedTokensAtBlock, "bridgedTokensAtBlock");

  for (let i = 0; i < rewardTokens.length; i++) {
    const rewardToken = rewardTokens[i];
    console.log("Calculating rewards for token: ", rewardToken);

    const collateralTypes = Object.keys(
      config().rewards.minter.config[rewardToken]
    );

    for (let j = 0; j < collateralTypes.length; j++) {
      const cType = collateralTypes[j];
      const rewardAmount = config().rewards.minter.config[rewardToken][cType];

      const users: UserList = await getInitialState(
        config().START_BLOCK,
        config().END_BLOCK,
        owners,
        {
          type: "MINTER_REWARDS",
          withBridge: false,
        },
        cType
      );

      Object.values(users).forEach(async (user) => {
        usersListWithBridge[user.address] = {
          ...user,
          totalBridgedTokens: getBridgedTokensAtBlock(
            bridgedData,
            user.address,
            cType,
            config().START_BLOCK
          ),
        };
      });

      const events = await getEvents(
        config().START_BLOCK,
        config().END_BLOCK,
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
};

//calculateMinterRewards(config().START_BLOCK, config().END_BLOCK);
