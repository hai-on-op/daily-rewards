import { providers } from "ethers";
import {
  RewardStrategy,
  BlockRange,
} from "../../interfaces/IRewardStrategy";
import { LpEvent, LpUserState, LpPosition } from "../types";
import { config } from "../../../config";
import { getInitialState } from "../../../services/initial-data/getInitialState";
import { getSafeOwnerMapping } from "../../../services/initial-data/getSafeOwnerMapping";
import { getEvents as getLpEvents } from "../../../services/get-events/lpGetEvents";
import { getAccumulatedRate } from "../../../services/initial-data/getAccumulatedRate";
import { getStakingWeightForLPPositions } from "../../../services/staking-weights/getStakingWeight";
import { getPoolState } from "../../../services/pool-state/getPoolState";
import { RewardEventType, Rates } from "../../../types";
import {
  getStakingPositions,
  calculateStakingAtTimestamp,
} from "../../../services/skite-data";

export class LpStrategy
  implements RewardStrategy<LpEvent, LpUserState>
{
  readonly name = "lp";
  private provider: providers.Provider;
  private subgraphUrl: string;

  // Mutable state
  private rates: Rates = {};
  private sqrtPrice: string | number = "0";

  // Caches
  private cachedOwners: Map<string, string> | null = null;
  private cachedStakingPositions: any[] | null = null;
  private lastBoostTimestamp: number = 0;
  private cachedBoosts: Map<string, number> | null = null;

  constructor(provider: providers.Provider, subgraphUrl: string) {
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
  ): Promise<Map<string, LpUserState>> {
    const owners = await this.getOwners(blockRange.endBlock);

    const userList = await getInitialState(
      blockRange.startBlock,
      blockRange.endBlock,
      owners,
      { type: "LP_REWARDS", withBridge: false },
      this.subgraphUrl
    );

    // Initialize accumulated rates
    const cTypes = config().LP_COLLATERAL_TYPES;
    for (const cType of cTypes) {
      this.rates[cType] = await getAccumulatedRate(
        blockRange.startBlock,
        cType,
        this.subgraphUrl
      );
    }

    // Fetch initial sqrtPrice
    const poolState = await getPoolState(
      blockRange.startBlock,
      config().UNISWAP_POOL_ADDRESS,
      config().UNISWAP_POSITIONS_SUBGRAPH_URL
    );
    this.sqrtPrice = poolState.sqrtPrice;

    // Convert UserList → Map
    const users = new Map<string, LpUserState>();
    for (const [addr, account] of Object.entries(userList)) {
      users.set(addr, {
        address: account.address,
        debt: account.debt,
        lpPositions: account.lpPositions.map((p) => ({
          tokenId: p.tokenId,
          lowerTick: p.lowerTick,
          upperTick: p.upperTick,
          liquidity: p.liquidity,
        })),
      });
    }

    return users;
  }

  async getEvents(blockRange: BlockRange): Promise<LpEvent[]> {
    const owners = await this.getOwners(blockRange.endBlock);

    const rawEvents = await getLpEvents(
      blockRange.startBlock,
      blockRange.endBlock,
      owners
    );

    return rawEvents.map((event) => {
      switch (event.type) {
        case RewardEventType.DELTA_DEBT:
          return {
            eventType: "DELTA_DEBT" as const,
            timestamp: event.timestamp,
            address: event.address,
            deltaDebt: event.value as number,
            cType: event.cType,
            logIndex: event.logIndex,
          };
        case RewardEventType.POOL_POSITION_UPDATE:
          return {
            eventType: "POOL_POSITION_UPDATE" as const,
            timestamp: event.timestamp,
            address: event.address,
            position: event.value as LpPosition,
            logIndex: event.logIndex,
          };
        case RewardEventType.POOL_SWAP:
          return {
            eventType: "POOL_SWAP" as const,
            timestamp: event.timestamp,
            sqrtPrice: event.value as number | string,
            logIndex: event.logIndex,
          };
        case RewardEventType.UPDATE_ACCUMULATED_RATE:
          return {
            eventType: "UPDATE_ACCUMULATED_RATE" as const,
            timestamp: event.timestamp,
            rateMultiplier: event.value as number,
            cType: event.cType,
            logIndex: event.logIndex,
          };
        default:
          throw new Error(`Unknown LP event type: ${event.type}`);
      }
    });
  }

  getWeight(state: LpUserState): number {
    return getStakingWeightForLPPositions(state.lpPositions);
  }

  createDefaultState(address: string): LpUserState {
    return { address, debt: 0, lpPositions: [] };
  }

  shouldCreditAllUsers(event: LpEvent): boolean {
    // DELTA_DEBT: single user credit (matches old code)
    // POOL_POSITION_UPDATE: single user credit (matches old code — prev NFT
    //   owner is also credited at the same rewardPerWeight which is equivalent)
    // POOL_SWAP: all users (global event)
    // UPDATE_ACCUMULATED_RATE: all users (global event)
    return (
      event.eventType === "POOL_SWAP" ||
      event.eventType === "UPDATE_ACCUMULATED_RATE"
    );
  }

  getAdditionalCredits(
    event: LpEvent,
    users: Map<string, LpUserState>
  ): string[] {
    if (event.eventType !== "POOL_POSITION_UPDATE" || !event.position) {
      return [];
    }

    const addr = event.address!;
    const tokenId = event.position.tokenId;
    const result: string[] = [];

    // Detect NFT transfer: find another user with the same tokenId
    for (const [otherAddr, otherUser] of users) {
      if (otherAddr === addr) continue;
      if (otherUser.lpPositions.some((p) => p.tokenId === tokenId)) {
        result.push(otherAddr);
      }
    }

    return result;
  }

  applyEvent(
    event: LpEvent,
    users: Map<string, LpUserState>
  ): void {
    switch (event.eventType) {
      case "DELTA_DEBT": {
        const addr = event.address!;
        let user = users.get(addr);
        if (!user) {
          user = { address: addr, debt: 0, lpPositions: [] };
          users.set(addr, user);
        }

        const accumulatedRate = this.rates[event.cType as string] ?? 1;
        const adjustedDeltaDebt = (event.deltaDebt ?? 0) * accumulatedRate;
        user.debt += adjustedDeltaDebt;

        if (user.debt < 0 && user.debt > -0.4) {
          user.debt = 0;
        }
        break;
      }

      case "POOL_POSITION_UPDATE": {
        const addr = event.address!;
        const updatedPosition = event.position!;

        let user = users.get(addr);
        if (!user) {
          user = { address: addr, debt: 0, lpPositions: [] };
          users.set(addr, user);
        }

        // Detect NFT transfer: find another user with the same tokenId
        // (previous owner was already credited via getAdditionalCredits)
        for (const [otherAddr, otherUser] of users) {
          if (otherAddr === addr) continue;
          const posIdx = otherUser.lpPositions.findIndex(
            (p) => p.tokenId === updatedPosition.tokenId
          );
          if (posIdx !== -1) {
            // NFT transfer detected — remove from previous owner
            otherUser.lpPositions.splice(posIdx, 1);
          }
        }

        // Create or update position
        const index = user.lpPositions.findIndex(
          (p) => p.tokenId === updatedPosition.tokenId
        );
        if (index === -1) {
          user.lpPositions.push({
            tokenId: updatedPosition.tokenId,
            lowerTick: updatedPosition.lowerTick,
            upperTick: updatedPosition.upperTick,
            liquidity: updatedPosition.liquidity,
          });
        } else {
          user.lpPositions[index].liquidity = updatedPosition.liquidity;
        }

        break;
      }

      case "POOL_SWAP": {
        this.sqrtPrice = event.sqrtPrice!;
        break;
      }

      case "UPDATE_ACCUMULATED_RATE": {
        const rateMultiplier = event.rateMultiplier ?? 0;
        const cType = event.cType as string;
        this.rates[cType] = (this.rates[cType] ?? 0) + rateMultiplier;

        // Multiply ALL users' debt
        for (const [, user] of users) {
          user.debt *= rateMultiplier + 1;
        }
        break;
      }
    }
  }

  async calculateBoosts(
    users: Map<string, LpUserState>,
    timestamp: number
  ): Promise<Map<string, number>> {
    // Cache by timestamp
    if (this.cachedBoosts && this.lastBoostTimestamp === timestamp) {
      return this.cachedBoosts;
    }

    if (!this.cachedStakingPositions) {
      this.cachedStakingPositions = await getStakingPositions();
    }

    const stakingState = calculateStakingAtTimestamp(
      this.cachedStakingPositions,
      timestamp
    );

    // totalLPLiquidity = sum of ALL position liquidity (not just full-range)
    let totalLPLiquidity = 0;
    for (const [, user] of users) {
      for (const p of user.lpPositions) {
        totalLPLiquidity += Number(p.liquidity);
      }
    }

    const boosts = new Map<string, number>();

    for (const [addr, data] of Object.entries(stakingState.users) as [
      string,
      any
    ][]) {
      const user = users.get(addr);
      const userWeight = user
        ? getStakingWeightForLPPositions(user.lpPositions)
        : 0;
      const userKiteShare = data.share;

      const boost = userWeight
        ? Math.min(
            userKiteShare / (userWeight / totalLPLiquidity) + 1,
            2
          )
        : 1;

      boosts.set(addr, boost);
    }

    this.cachedBoosts = boosts;
    this.lastBoostTimestamp = timestamp;
    return boosts;
  }
}
