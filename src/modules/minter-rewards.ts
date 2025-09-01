import fs from 'fs';
import path from 'path';
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

  console.log('--------------------------------');
  console.log('minterSetupData', minterSetupData);
  console.log('--------------------------------');

  type FinalResult = Record<string, Record<string, UserList>>;
  const finalResult: FinalResult = {};

  // Iterate through each configured window
  for (let w = 0; w < minterSetupData.windows.length; w++) {
    const window = minterSetupData.windows[w];
    const effectiveEndBlock = window.endBlock ?? toBlock;
    const owners = await getSafeOwnerMapping(effectiveEndBlock);

    const rewardTokens = Object.keys(window.config);

    for (let i = 0; i < rewardTokens.length; i++) {
      const rewardToken = rewardTokens[i];
      const collateralTypes = Object.keys(window.config[rewardToken] || {});

      for (let j = 0; j < collateralTypes.length; j++) {
        const cType = collateralTypes[j];

        const startBlock = window.startBlock;
        const endBlock = effectiveEndBlock;
        const dailyRewardAmount = window.config[rewardToken][cType] ?? 0;
        const totalBlocks = endBlock - startBlock;
        const secsInDay = 86400;
        const opBlockTime = 2;
        const blocksInDay = Math.floor(secsInDay / opBlockTime);
        const perBlockRewardAmount = blocksInDay > 0 ? dailyRewardAmount / blocksInDay : 0;
        const rewardAmount = perBlockRewardAmount * totalBlocks;

        const usersListWithBridge: UserList = {};

        const cTypeFilter: string | string[] =
          cType === 'HAIVELO' ? config().HAIVELO_COLLATERAL_IDS : cType;

        const users: UserList = await getInitialState(
          startBlock,
          endBlock,
          owners,
          {
            type: 'MINTER_REWARDS',
            withBridge: false
          },
          config().MINTER_GEB_SUBGRAPH_URL,
          cTypeFilter
        );

        Object.values(users).forEach(async user => {
          usersListWithBridge[user.address] = {
            ...user,
            totalBridgedTokens: 0
          };
        });

        const events = await getEvents(startBlock, endBlock, owners, cTypeFilter);

        const result = await processRewardEvent(
          [],
          usersListWithBridge,
          events,
          rewardAmount,
          false,
          { startBlock, endBlock },
          config().DEBUG_REWARDS
        );

        const usersListWithRewards = result.users;

        if (config().DEBUG_REWARDS && result.debugEvents) {
          const dir = path.join(
            config().DEBUG_OUTPUT_DIR,
            'minter',
            `window-${w}`,
            rewardToken,
            cType
          );
          fs.mkdirSync(dir, { recursive: true });
          const meta = {
            window: { startBlock, endBlock },
            rewardToken,
            collateralType: cType,
            dailyRewardAmount,
            totalBlocks,
            rewardAmount
          };
          fs.writeFileSync(
            path.join(dir, 'debug.json'),
            JSON.stringify({ meta, events: result.debugEvents }, null, 2)
          );
        }

        if (!finalResult[rewardToken]) {
          finalResult[rewardToken] = {};
        }

        // Merge results across windows per rewardToken/cType
        const existing = finalResult[rewardToken][cType] || {};
        const merged: UserList = { ...existing } as UserList;
        Object.entries(usersListWithRewards).forEach(([address, value]) => {
          if (!merged[address]) {
            merged[address] = { ...value } as any;
          } else {
            merged[address] = {
              ...merged[address],
              earned: (merged[address].earned || 0) + (value.earned || 0),
              debt: value.debt, // latest state not used downstream, earned is aggregated
              collateral: value.collateral,
              stakingWeight: value.stakingWeight,
              totalBridgedTokens: value.totalBridgedTokens
            } as any;
          }
        });

        finalResult[rewardToken][cType] = merged;
      }
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
