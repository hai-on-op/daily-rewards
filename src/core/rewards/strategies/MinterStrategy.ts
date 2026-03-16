import { providers } from "ethers";
import {
  RewardStrategy,
  BlockRange,
} from "../../interfaces/IRewardStrategy";
import { MinterEvent, MinterUserState } from "../types";
import { config } from "../../../config";
import { getInitialState } from "../../../services/initial-data/getInitialState";
import { getSafeOwnerMapping } from "../../../services/initial-data/getSafeOwnerMapping";
import { getEvents } from "../../../services/get-events/minterGetEvents";
import { getAccumulatedRate } from "../../../services/initial-data/getAccumulatedRate";
import { RewardEventType } from "../../../types";

export class MinterStrategy
  implements RewardStrategy<MinterEvent, MinterUserState>
{
  readonly name: string;
  private provider: providers.Provider;
  private cType: string;
  private subgraphUrl: string;

  // Mutable state
  private accumulatedRate: number = 1;

  // Caches
  private cachedOwners: Map<string, string> | null = null;
  private lastBoostTimestamp: number = 0;
  private cachedBoosts: Map<string, number> | null = null;

  constructor(
    cType: string,
    provider: providers.Provider,
    subgraphUrl: string
  ) {
    this.name = `minter-${cType}`;
    this.cType = cType;
    this.provider = provider;
    this.subgraphUrl = subgraphUrl;
  }

  private async getOwners(endBlock: number): Promise<Map<string, string>> {
    if (!this.cachedOwners) {
      this.cachedOwners = await getSafeOwnerMapping(endBlock);
    }
    return this.cachedOwners;
  }

  async getInitialUsers(
    blockRange: BlockRange
  ): Promise<Map<string, MinterUserState>> {
    const owners = await this.getOwners(blockRange.endBlock);

    const userList = await getInitialState(
      blockRange.startBlock,
      blockRange.endBlock,
      owners,
      { type: "MINTER_REWARDS", withBridge: false },
      this.subgraphUrl,
      this.cType
    );

    // Get accumulated rate at start block
    this.accumulatedRate = await getAccumulatedRate(
      blockRange.startBlock,
      this.cType,
      this.subgraphUrl
    );

    const users = new Map<string, MinterUserState>();
    for (const [addr, account] of Object.entries(userList)) {
      users.set(addr, {
        address: account.address,
        debt: account.debt,
        collateral: account.collateral,
        totalBridgedTokens: 0,
      });
    }

    return users;
  }

  async getEvents(blockRange: BlockRange): Promise<MinterEvent[]> {
    const owners = await this.getOwners(blockRange.endBlock);

    const rawEvents = await getEvents(
      blockRange.startBlock,
      blockRange.endBlock,
      owners,
      this.cType
    );

    return rawEvents.map((event) => {
      if (event.type === RewardEventType.DELTA_DEBT) {
        return {
          eventType: "DELTA_DEBT" as const,
          timestamp: event.timestamp,
          address: event.address,
          deltaDebt: event.value as number,
          complementaryValue: event.complementaryValue,
          cType: event.cType,
          createdAtBlock: event.createdAtBlock,
          logIndex: event.logIndex,
        };
      } else {
        return {
          eventType: "UPDATE_ACCUMULATED_RATE" as const,
          timestamp: event.timestamp,
          rateMultiplier: event.value as number,
          cType: event.cType,
          logIndex: event.logIndex,
        };
      }
    });
  }

  getWeight(state: MinterUserState): number {
    return state.debt;
  }

  shouldCreditAllUsers(event: MinterEvent): boolean {
    // DELTA_DEBT: old code only credits the single affected user
    // UPDATE_ACCUMULATED_RATE: old code credits all users
    return event.eventType === "UPDATE_ACCUMULATED_RATE";
  }

  createDefaultState(address: string): MinterUserState {
    return { address, debt: 0, collateral: 0, totalBridgedTokens: 0 };
  }

  applyEvent(
    event: MinterEvent,
    users: Map<string, MinterUserState>
  ): void {
    switch (event.eventType) {
      case "DELTA_DEBT": {
        const addr = event.address!;
        let user = users.get(addr);
        if (!user) {
          user = { address: addr, debt: 0, collateral: 0, totalBridgedTokens: 0 };
          users.set(addr, user);
        }

        const adjustedDeltaDebt =
          (event.deltaDebt ?? 0) * this.accumulatedRate;
        user.debt += adjustedDeltaDebt;
        user.collateral += event.complementaryValue ?? 0;

        // Dusty debt handling
        if (user.debt < 0 && user.debt > -0.4) {
          user.debt = 0;
        }
        break;
      }

      case "UPDATE_ACCUMULATED_RATE": {
        const rateMultiplier = event.rateMultiplier ?? 0;
        this.accumulatedRate += rateMultiplier;

        // Multiply ALL users' debt
        for (const [, user] of users) {
          user.debt *= rateMultiplier + 1;
        }
        break;
      }
    }
  }

  async calculateBoosts(
    users: Map<string, MinterUserState>,
    timestamp: number
  ): Promise<Map<string, number>> {
    // Cache by timestamp — matches old minter processor behavior
    if (this.cachedBoosts && this.lastBoostTimestamp === timestamp) {
      return this.cachedBoosts;
    }

    const totalDebt = Array.from(users.values()).reduce(
      (acc, u) => acc + u.debt,
      0
    );

    const boosts = new Map<string, number>();
    for (const [addr, user] of users) {
      const userDebtShare = totalDebt > 0 ? user.debt / totalDebt : 0;
      const boost = user.debt > 0 ? Math.min(userDebtShare + 1, 2) : 1;
      boosts.set(addr, boost);
    }

    this.cachedBoosts = boosts;
    this.lastBoostTimestamp = timestamp;
    return boosts;
  }
}
