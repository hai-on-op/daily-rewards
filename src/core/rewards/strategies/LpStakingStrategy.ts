import { providers } from "ethers";
import {
  RewardStrategy,
  BlockRange,
} from "../../interfaces/IRewardStrategy";
import { LpStakingEvent, LpStakingUserState } from "../types";
import { LpStakingType } from "../../../config/types";
import {
  getInitialLpStakingState,
  getLpStakingEventsInRange,
} from "../../../services/lp-staking-data/getInitialLpStakingState";
import {
  getStakingPositions,
  calculateStakingAtTimestamp,
} from "../../../services/skite-data";

export class LpStakingStrategy
  implements RewardStrategy<LpStakingEvent, LpStakingUserState>
{
  readonly name: string;
  private cachedStakingPositions: any[] | null = null;
  private provider: providers.Provider;
  private stakingType: LpStakingType;

  constructor(stakingType: LpStakingType, provider: providers.Provider) {
    this.name = `lp-staking-${stakingType}`;
    this.stakingType = stakingType;
    this.provider = provider;
  }

  async getInitialUsers(
    blockRange: BlockRange
  ): Promise<Map<string, LpStakingUserState>> {
    const startTimestamp = (
      await this.provider.getBlock(blockRange.startBlock)
    ).timestamp;

    const userList = await getInitialLpStakingState(
      this.stakingType,
      startTimestamp
    );

    const users = new Map<string, LpStakingUserState>();
    for (const [addr, account] of Object.entries(userList)) {
      users.set(addr, {
        address: account.address,
        lpStaked: account.collateral,
      });
    }

    return users;
  }

  async getEvents(blockRange: BlockRange): Promise<LpStakingEvent[]> {
    const [startTimestamp, endTimestamp] = await Promise.all([
      this.provider.getBlock(blockRange.startBlock).then((b) => b.timestamp),
      this.provider.getBlock(blockRange.endBlock).then((b) => b.timestamp),
    ]);

    const events = await getLpStakingEventsInRange(
      this.stakingType,
      startTimestamp,
      endTimestamp
    );

    return events.map((event) => {
      const amount = Number(event.amount) / 1e18;
      const delta = event.type === "STAKE" ? amount : -amount;

      return {
        timestamp: parseInt(event.timestamp),
        address: event.user.id.toLowerCase(),
        deltaAmount: delta,
      };
    });
  }

  getWeight(state: LpStakingUserState): number {
    return state.lpStaked;
  }

  createDefaultState(address: string): LpStakingUserState {
    return { address, lpStaked: 0 };
  }

  applyEvent(
    event: LpStakingEvent,
    users: Map<string, LpStakingUserState>
  ): void {
    let user = users.get(event.address);
    if (!user) {
      user = { address: event.address, lpStaked: 0 };
      users.set(event.address, user);
    }

    user.lpStaked += event.deltaAmount;

    // Dusty handling — threshold 0.0001 (matches existing LP staking behavior)
    if (user.lpStaked < 0 && user.lpStaked > -0.0001) {
      user.lpStaked = 0;
    }
  }

  async calculateBoosts(
    users: Map<string, LpStakingUserState>,
    timestamp: number
  ): Promise<Map<string, number>> {
    if (!this.cachedStakingPositions) {
      this.cachedStakingPositions = await getStakingPositions();
    }

    const stakingState = calculateStakingAtTimestamp(
      this.cachedStakingPositions,
      timestamp
    );

    const totalLpStaked = Array.from(users.values()).reduce(
      (acc, u) => acc + u.lpStaked,
      0
    );

    const boosts = new Map<string, number>();

    for (const [addr, data] of Object.entries(stakingState.users) as [
      string,
      any
    ][]) {
      const userLpStaked = users.get(addr)?.lpStaked ?? 0;
      const userKiteShare = data.share;
      const userLpShare =
        totalLpStaked > 0 ? userLpStaked / totalLpStaked : 0;

      const boost =
        userLpShare > 0
          ? Math.min(userKiteShare / userLpShare + 1, 2)
          : 1;

      boosts.set(addr, boost);
    }

    return boosts;
  }
}
