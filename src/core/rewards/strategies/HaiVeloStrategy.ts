import { providers } from "ethers";
import {
  RewardStrategy,
  BlockRange,
} from "../../interfaces/IRewardStrategy";
import { HaiVeloEvent, HaiVeloUserState } from "../types";
import { config } from "../../../config";
import {
  getRawHaiveloCollateralData,
  processHaiveloCollateral,
  HaiveloCollateralEvent,
} from "../../../services/initial-data/getInitialHaiveloState";
import {
  getLpStakingPositions,
  LpStakingPositionEvent,
} from "../../../services/lp-staking-data";
import {
  loadSyncEventsCache,
  clearSyncEventsCache,
  getClosestSyncEventFromCache,
  calculateHaiVeloPerLp,
  getPoolState,
  SyncEvent,
} from "../../../services/haivelo-lp-data";
import {
  getStakingPositions,
  calculateStakingAtTimestamp,
} from "../../../services/skite-data";

export class HaiVeloStrategy
  implements RewardStrategy<HaiVeloEvent, HaiVeloUserState>
{
  readonly name = "haivelo";
  private provider: providers.Provider;

  // Mutable price state — updated by PRICE_UPDATE events
  private currentHaiVeloPerLp: number = 0;

  // Caches
  private cachedStakingPositions: any[] | null = null;
  private cachedCollateralEvents: HaiveloCollateralEvent[] | null = null;
  private cachedLpStakingEvents: LpStakingPositionEvent[] | null = null;
  private cachedSyncEvents: SyncEvent[] | null = null;
  private cachedTotalSupply: bigint = BigInt(0);

  constructor(provider: providers.Provider) {
    this.provider = provider;
  }

  private async getCollateralEvents(): Promise<HaiveloCollateralEvent[]> {
    if (!this.cachedCollateralEvents) {
      if (config().HAIVELO_COLLATERAL_ENABLED) {
        this.cachedCollateralEvents = await getRawHaiveloCollateralData();
      } else {
        this.cachedCollateralEvents = [];
      }
    }
    return this.cachedCollateralEvents;
  }

  private async getLpEvents(): Promise<LpStakingPositionEvent[]> {
    if (!this.cachedLpStakingEvents) {
      if (
        config().HAIVELO_LP_STAKING_ENABLED &&
        config().HAIVELO_VELO_LP_INDEXER
      ) {
        this.cachedLpStakingEvents = await getLpStakingPositions(
          "HAI_VELO_VELO"
        );
      } else {
        this.cachedLpStakingEvents = [];
      }
    }
    return this.cachedLpStakingEvents;
  }

  private async getSyncEventsAndPool(): Promise<{
    syncEvents: SyncEvent[];
    totalSupply: bigint;
  }> {
    if (!this.cachedSyncEvents) {
      if (
        config().HAIVELO_LP_STAKING_ENABLED &&
        config().HAIVELO_VELO_LP_INDEXER
      ) {
        try {
          const poolState = await getPoolState();
          if (poolState) {
            this.cachedTotalSupply = BigInt(poolState.totalSupply);
            this.cachedSyncEvents = await loadSyncEventsCache();
            clearSyncEventsCache();
          } else {
            this.cachedSyncEvents = [];
          }
        } catch {
          this.cachedSyncEvents = [];
        }
      } else {
        this.cachedSyncEvents = [];
      }
    }
    return {
      syncEvents: this.cachedSyncEvents!,
      totalSupply: this.cachedTotalSupply,
    };
  }

  async getInitialUsers(
    blockRange: BlockRange
  ): Promise<Map<string, HaiVeloUserState>> {
    const startTimestamp = (
      await this.provider.getBlock(blockRange.startBlock)
    ).timestamp;

    // 1. Get collateral initial state
    const allCollateralEvents = await this.getCollateralEvents();
    const initialCollateralEvents = allCollateralEvents
      .filter((event) => Number(event.createdAtBlock) < blockRange.startBlock)
      .sort((a, b) => Number(a.createdAtBlock) - Number(b.createdAtBlock));
    const initialUserList = processHaiveloCollateral(initialCollateralEvents);

    // 2. Get LP staking initial state (raw amounts)
    const lpEvents = await this.getLpEvents();
    const initialLpStakingRaw: Record<string, number> = {};
    for (const event of lpEvents) {
      const eventTimestamp = parseInt(event.timestamp);
      if (eventTimestamp >= startTimestamp) continue;
      if (event.type !== "STAKE" && event.type !== "WITHDRAW") continue;

      const addr = event.user.id.toLowerCase();
      const amount = Number(event.amount) / 1e18;
      if (!initialLpStakingRaw[addr]) initialLpStakingRaw[addr] = 0;
      initialLpStakingRaw[addr] +=
        event.type === "STAKE" ? amount : -amount;

      if (
        initialLpStakingRaw[addr] < 0 &&
        initialLpStakingRaw[addr] > -0.0001
      ) {
        initialLpStakingRaw[addr] = 0;
      }
    }

    // 3. Get initial haiVELO per LP ratio (only if LP staking is enabled)
    const { syncEvents, totalSupply } = await this.getSyncEventsAndPool();

    if (syncEvents.length > 0 && totalSupply > BigInt(0)) {
      // Load sync events into cache for getClosestSyncEventFromCache
      await loadSyncEventsCache();
      const initialSyncEvent = getClosestSyncEventFromCache(startTimestamp);
      if (initialSyncEvent) {
        this.currentHaiVeloPerLp = calculateHaiVeloPerLp(
          initialSyncEvent,
          totalSupply
        );
      }
      clearSyncEventsCache();
    }

    // 4. Build user map
    const users = new Map<string, HaiVeloUserState>();

    // Add collateral users
    for (const [addr, account] of Object.entries(initialUserList)) {
      const lpRaw = initialLpStakingRaw[addr] || 0;
      users.set(addr, {
        address: account.address,
        collateral: account.collateral,
        lpStakedRaw: lpRaw,
      });
    }

    // Add LP-only users
    for (const [addr, lpRaw] of Object.entries(initialLpStakingRaw)) {
      if (!users.has(addr)) {
        users.set(addr, {
          address: addr,
          collateral: 0,
          lpStakedRaw: lpRaw,
        });
      }
    }

    return users;
  }

  async getEvents(blockRange: BlockRange): Promise<HaiVeloEvent[]> {
    const [startTimestamp, endTimestamp] = await Promise.all([
      this.provider.getBlock(blockRange.startBlock).then((b) => b.timestamp),
      this.provider.getBlock(blockRange.endBlock).then((b) => b.timestamp),
    ]);

    const events: HaiVeloEvent[] = [];

    // 1. Collateral events (filtered by block)
    const allCollateralEvents = await this.getCollateralEvents();
    const collateralInRange = allCollateralEvents.filter(
      (e) =>
        Number(e.createdAtBlock) >= blockRange.startBlock &&
        Number(e.createdAtBlock) <= blockRange.endBlock
    );
    for (const e of collateralInRange) {
      events.push({
        eventType: "COLLATERAL",
        timestamp: Number(e.createdAt),
        address: e.safe.owner.address,
        deltaCollateral: Number(e.deltaCollateral),
      });
    }

    // 2. LP staking events (filtered by timestamp)
    const lpEvents = await this.getLpEvents();
    for (const e of lpEvents) {
      const ts = parseInt(e.timestamp);
      if (ts < startTimestamp || ts > endTimestamp) continue;
      if (e.type !== "STAKE" && e.type !== "WITHDRAW") continue;

      const amount = Number(e.amount) / 1e18;
      events.push({
        eventType: "LP_STAKING",
        timestamp: ts,
        address: e.user.id.toLowerCase(),
        deltaLpAmount: e.type === "STAKE" ? amount : -amount,
      });
    }

    // 3. Price update events (sync events filtered by timestamp)
    const { syncEvents, totalSupply } = await this.getSyncEventsAndPool();
    for (const e of syncEvents) {
      const ts = parseInt(e.timestamp);
      if (ts < startTimestamp || ts > endTimestamp) continue;

      events.push({
        eventType: "PRICE_UPDATE",
        timestamp: ts,
        haiVeloPerLp: calculateHaiVeloPerLp(e, totalSupply),
      });
    }

    // Sort by timestamp
    events.sort((a, b) => a.timestamp - b.timestamp);

    return events;
  }

  getWeight(state: HaiVeloUserState): number {
    return state.collateral + state.lpStakedRaw * this.currentHaiVeloPerLp;
  }

  createDefaultState(address: string): HaiVeloUserState {
    return { address, collateral: 0, lpStakedRaw: 0 };
  }

  applyEvent(
    event: HaiVeloEvent,
    users: Map<string, HaiVeloUserState>
  ): void {
    switch (event.eventType) {
      case "COLLATERAL": {
        const addr = event.address!;
        let user = users.get(addr);
        if (!user) {
          user = { address: addr, collateral: 0, lpStakedRaw: 0 };
          users.set(addr, user);
        }
        user.collateral += event.deltaCollateral!;
        if (user.collateral < 0 && user.collateral > -0.4) {
          user.collateral = 0;
        }
        break;
      }

      case "LP_STAKING": {
        const addr = event.address!;
        let user = users.get(addr);
        if (!user) {
          user = { address: addr, collateral: 0, lpStakedRaw: 0 };
          users.set(addr, user);
        }
        user.lpStakedRaw += event.deltaLpAmount!;
        if (user.lpStakedRaw < 0 && user.lpStakedRaw > -0.0001) {
          user.lpStakedRaw = 0;
        }
        break;
      }

      case "PRICE_UPDATE": {
        // Update the price ratio — getWeight() will return different values
        this.currentHaiVeloPerLp = event.haiVeloPerLp!;
        break;
      }
    }
  }

  async calculateBoosts(
    users: Map<string, HaiVeloUserState>,
    timestamp: number
  ): Promise<Map<string, number>> {
    if (!this.cachedStakingPositions) {
      this.cachedStakingPositions = await getStakingPositions();
    }

    const stakingState = calculateStakingAtTimestamp(
      this.cachedStakingPositions,
      timestamp
    );

    const totalWeight = Array.from(users.values()).reduce(
      (acc, u) => acc + this.getWeight(u),
      0
    );

    const boosts = new Map<string, number>();

    for (const [addr, data] of Object.entries(stakingState.users) as [
      string,
      any
    ][]) {
      const user = users.get(addr);
      const userWeight = user ? this.getWeight(user) : 0;
      const userKiteShare = data.share;

      const boost = userWeight
        ? Math.min(userKiteShare / (userWeight / totalWeight) + 1, 2)
        : 1;

      boosts.set(addr, boost);
    }

    return boosts;
  }
}
