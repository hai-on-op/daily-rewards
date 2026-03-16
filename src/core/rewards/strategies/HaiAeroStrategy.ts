import {
  RewardStrategy,
  BlockRange,
} from "../../interfaces/IRewardStrategy";
import { HaiAeroEvent, HaiAeroUserState } from "../types";
import {
  getRawHaiaeroCollateralData,
  processHaiaeroCollateral,
} from "../../../services/initial-data/getInitialHaiaeroState";
import {
  getStakingPositions,
  calculateStakingAtTimestamp,
} from "../../../services/skite-data";

export class HaiAeroStrategy
  implements RewardStrategy<HaiAeroEvent, HaiAeroUserState>
{
  readonly name = "haiaero";
  private cachedStakingPositions: any[] | null = null;
  private cachedCollateralEvents: any[] | null = null;

  private async getRawEvents() {
    if (!this.cachedCollateralEvents) {
      this.cachedCollateralEvents = await getRawHaiaeroCollateralData();
    }
    return this.cachedCollateralEvents;
  }

  async getInitialUsers(
    blockRange: BlockRange
  ): Promise<Map<string, HaiAeroUserState>> {
    const allEvents = await this.getRawEvents();

    const initialEvents = allEvents
      .filter((event) => Number(event.createdAtBlock) < blockRange.startBlock)
      .sort(
        (a, b) => Number(a.createdAtBlock) - Number(b.createdAtBlock)
      );

    const userList = processHaiaeroCollateral(initialEvents);

    const users = new Map<string, HaiAeroUserState>();
    for (const [addr, account] of Object.entries(userList)) {
      users.set(addr, {
        address: account.address,
        collateral: account.collateral,
      });
    }

    return users;
  }

  async getEvents(blockRange: BlockRange): Promise<HaiAeroEvent[]> {
    const allEvents = await this.getRawEvents();

    return allEvents
      .filter(
        (event) =>
          Number(event.createdAtBlock) >= blockRange.startBlock &&
          Number(event.createdAtBlock) <= blockRange.endBlock
      )
      .map((event) => ({
        timestamp: Number(event.createdAt),
        address: event.safe.owner.address,
        deltaCollateral: Number(event.deltaCollateral),
      }));
  }

  getWeight(state: HaiAeroUserState): number {
    return state.collateral;
  }

  createDefaultState(address: string): HaiAeroUserState {
    return { address, collateral: 0 };
  }

  applyEvent(
    event: HaiAeroEvent,
    users: Map<string, HaiAeroUserState>
  ): void {
    let user = users.get(event.address);
    if (!user) {
      user = { address: event.address, collateral: 0 };
      users.set(event.address, user);
    }

    user.collateral += event.deltaCollateral;

    // Dusty handling — matches existing behavior
    if (user.collateral < 0 && user.collateral > -0.4) {
      user.collateral = 0;
    }
  }

  async calculateBoosts(
    users: Map<string, HaiAeroUserState>,
    timestamp: number
  ): Promise<Map<string, number>> {
    if (!this.cachedStakingPositions) {
      this.cachedStakingPositions = await getStakingPositions();
    }
    const stakingPositions = this.cachedStakingPositions;
    const stakingState = calculateStakingAtTimestamp(
      stakingPositions,
      timestamp
    );

    const totalCollateral = Array.from(users.values()).reduce(
      (acc, u) => acc + u.collateral,
      0
    );

    const boosts = new Map<string, number>();

    for (const [addr, data] of Object.entries(stakingState.users) as [
      string,
      any
    ][]) {
      const userCollateral = users.get(addr)?.collateral ?? 0;
      const userKiteShare = data.share;

      const boost = userCollateral
        ? Math.min(
            userKiteShare / (userCollateral / totalCollateral) + 1,
            2
          )
        : 1;

      boosts.set(addr, boost);
    }

    return boosts;
  }
}
