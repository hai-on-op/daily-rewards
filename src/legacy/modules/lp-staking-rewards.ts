import fs from "fs";
import path from "path";
import { UserList } from "../types";
import { config } from "../config";
import { LpStakingType } from "../config/types";
import { lpStakingProvider } from "../utils/chain";
import {
  getInitialLpStakingState,
  getLpStakingEventsInRange,
} from "../services/lp-staking-data/getInitialLpStakingState";
import { processLpStakingRewardEvents } from "../services/rewards/lpStakingRewardEventProcessor";

type FinalResult = Record<string, Record<string, UserList>>;

/**
 * Calculate LP staking rewards across multiple windows
 *
 * Similar to minter rewards, this supports multiple time windows with different
 * reward configurations. Each window can have different reward tokens and amounts
 * for each LP staking type (HAI_BOLD_CURVE, HAI_VELO_VELO).
 */
export const calculateLpStakingRewards = async (
  fromBlock: number,
  toBlock?: number
): Promise<FinalResult> => {
  const lpStakingSetupData = config().rewards.lpStaking;

  console.log("--------------------------------");
  console.log("LP Staking Rewards Setup Data:", lpStakingSetupData);
  console.log("--------------------------------");

  // Fetch latest block from RPC if toBlock is not provided
  let latestBlock: number | undefined;
  const getLatestBlock = async (): Promise<number> => {
    if (latestBlock === undefined) {
      latestBlock = await lpStakingProvider.getBlockNumber();
      console.log(`Fetched latest block from RPC: ${latestBlock}`);
    }
    return latestBlock;
  };

  const finalResult: FinalResult = {};

  // Iterate through each configured window
  for (let w = 0; w < lpStakingSetupData.windows.length; w++) {
    const window = lpStakingSetupData.windows[w];
    // Use window.endBlock if set, otherwise toBlock if provided, otherwise fetch latest from RPC
    const effectiveEndBlock = window.endBlock ?? toBlock ?? await getLatestBlock();

    const rewardTokens = Object.keys(window.config);

    for (let i = 0; i < rewardTokens.length; i++) {
      const rewardToken = rewardTokens[i];
      const stakingTypes = Object.keys(
        window.config[rewardToken] || {}
      ) as LpStakingType[];

      for (let j = 0; j < stakingTypes.length; j++) {
        const stakingType = stakingTypes[j];

        const startBlock = window.startBlock;
        const endBlock = effectiveEndBlock;
        const dailyRewardAmount = window.config[rewardToken][stakingType] ?? 0;

        // Calculate total rewards for the window based on block time
        const totalBlocks = endBlock - startBlock;
        const secsInDay = 86400;
        const opBlockTime = 2; // 2 seconds block time on Optimism
        const blocksInDay = Math.floor(secsInDay / opBlockTime);
        const perBlockRewardAmount =
          blocksInDay > 0 ? dailyRewardAmount / blocksInDay : 0;
        console.log(
          "blocksInDay",
          blocksInDay,
          "perBlockRewardAmount",
          perBlockRewardAmount,
          totalBlocks
        );

        const rewardAmount = perBlockRewardAmount * totalBlocks;

        console.log(`\nProcessing LP Staking Rewards:`);
        console.log(`  Window ${w}: Block ${startBlock} -> ${endBlock}`);
        console.log(`  Reward Token: ${rewardToken}`);
        console.log(`  Staking Type: ${stakingType}`);
        console.log(`  Daily Amount: ${dailyRewardAmount}`);
        console.log(`  Total Reward: ${rewardAmount}`);

        // Get start and end timestamps for filtering events
        const startTimestamp = (await lpStakingProvider.getBlock(startBlock))
          .timestamp;
        const endTimestamp = (await lpStakingProvider.getBlock(endBlock))
          .timestamp;

        // Get initial state before the window starts
        const users: UserList = await getInitialLpStakingState(
          stakingType,
          startTimestamp
        );

        console.log(`  Initial users: ${Object.keys(users).length}`);

        // Get events within the window
        const events = await getLpStakingEventsInRange(
          stakingType,
          startTimestamp,
          endTimestamp
        );

        console.log(`  Events in range: ${events.length}`);

        // Process rewards
        const result = await processLpStakingRewardEvents(
          rewardAmount,
          events,
          users,
          { startBlock, endBlock },
          config().DEBUG_REWARDS
        );

        const usersListWithRewards = result.users;

        // Write debug output if enabled
        if (config().DEBUG_REWARDS && result.debugEvents) {
          const dir = path.join(
            config().DEBUG_OUTPUT_DIR,
            "lp-staking",
            `window-${w}`,
            rewardToken,
            stakingType
          );
          fs.mkdirSync(dir, { recursive: true });
          const meta = {
            window: { startBlock, endBlock },
            rewardToken,
            stakingType,
            dailyRewardAmount,
            totalBlocks,
            rewardAmount,
          };
          fs.writeFileSync(
            path.join(dir, "debug.json"),
            JSON.stringify({ meta, events: result.debugEvents }, null, 2)
          );
        }

        // Initialize result structure if needed
        if (!finalResult[rewardToken]) {
          finalResult[rewardToken] = {};
        }

        // Merge results across windows per rewardToken/stakingType
        const existing = finalResult[rewardToken][stakingType] || {};
        const merged: UserList = { ...existing } as UserList;

        Object.entries(usersListWithRewards).forEach(([address, value]) => {
          if (!merged[address]) {
            merged[address] = { ...value } as any;
          } else {
            merged[address] = {
              ...merged[address],
              earned: (merged[address].earned || 0) + (value.earned || 0),
              collateral: value.collateral, // Latest state
              stakingWeight: value.stakingWeight,
            } as any;
          }
        });

        finalResult[rewardToken][stakingType] = merged;

        console.log(
          `  Users with rewards: ${Object.keys(usersListWithRewards).length}`
        );
      }
    }
  }

  return finalResult;
};

// For testing purposes
if (require.main === module) {
  calculateLpStakingRewards(
    config().LP_STAKING_START_BLOCK,
    config().LP_STAKING_END_BLOCK
  )
    .then((rewards) => {
      console.log("\n=== LP Staking Rewards Results ===\n");

      Object.entries(rewards).forEach(([rewardToken, stakingTypes]) => {
        console.log(`\n${rewardToken}:`);

        Object.entries(stakingTypes).forEach(([stakingType, userList]) => {
          console.log(`\n  ${stakingType}:`);

          const sortedUsers = Object.entries(userList)
            .map(([address, value]) => ({
              address,
              earned: value.earned,
            }))
            .sort((a, b) => b.earned - a.earned)
            .slice(0, 10);

          sortedUsers.forEach((user, index) => {
            console.log(
              `    ${index + 1}. ${user.address}: ${user.earned.toFixed(4)}`
            );
          });
        });
      });
    })
    .catch(console.error);
}
