import { config } from "../config";
import { getBridgeData } from "../services/bridge-data";
import { getInitialState } from "../services/initial-data/getInitialState";
import { getSafeOwnerMapping } from "../services/initial-data/getSafeOwnerMapping";
import { UserList } from "../types";

const calculateMinterRewards = async (fromBlock: number, toBlock: number) => {
  const owners = await getSafeOwnerMapping(config().END_BLOCK);

  const rewardTokens = Object.keys(config().rewards.minter.config);


  let usersAddresses = new Set<string>();

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

      Object.keys(users).forEach((userAddress) =>
        usersAddresses.add(userAddress.toLowerCase())
      );

      console.log(
        `Calculated ${
          Object.keys(users).length
        } users for ${rewardToken} ${cType}`
      );
    }
  }

  console.log(` unique addresses`, usersAddresses);

  const bridgedData = getBridgeData({ fromBlock, toBlock }, undefined, [
    ...usersAddresses,
  ]);

  console.log(await bridgedData, "bridgedData");
};

calculateMinterRewards(config().START_BLOCK, config().END_BLOCK);
