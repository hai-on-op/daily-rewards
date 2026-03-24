import { RewardStrategy, StrategyEvent } from "../interfaces/IRewardStrategy";

export interface DistributorConfig {
  startTimestamp: number;
  endTimestamp: number;
  rewardAmount: number;
}

export interface DailySnapshot {
  /** Start-of-day timestamp (midnight UTC) */
  dayTimestamp: number;
  /** Cumulative earned up to this day boundary */
  earned: Map<string, number>;
  /** Position weight per user (from strategy.getWeight) at this boundary */
  weights: Map<string, number>;
  /** Boost multiplier per user at this boundary */
  boosts: Map<string, number>;
  /** Sum of weight * boost across all users */
  totalWeight: number;
  /** Sum of weight (unboosted) across all users */
  totalUnboostedWeight: number;
}

export interface DistributionResult {
  earned: Map<string, number>;
  /** Cumulative earned snapshots at each day boundary (midnight UTC) */
  dailySnapshots: DailySnapshot[];
}

export class TimeWeightedDistributor {
  async distribute<TEvent extends StrategyEvent, TUserState>(
    strategy: RewardStrategy<TEvent, TUserState>,
    events: TEvent[],
    initialUsers: Map<string, TUserState>,
    config: DistributorConfig
  ): Promise<DistributionResult> {
    const { startTimestamp, endTimestamp, rewardAmount } = config;
    const timeDelta = endTimestamp - startTimestamp;

    const earned = new Map<string, number>();
    const rewardPerWeightStored = new Map<string, number>();

    if (timeDelta <= 0) {
      return { earned, dailySnapshots: [] };
    }

    const rewardRate = rewardAmount / timeDelta;

    // Clone users map so we don't mutate the input
    const users = new Map<string, TUserState>();
    for (const [addr, state] of initialUsers) {
      users.set(addr, { ...state });
      earned.set(addr, 0);
      rewardPerWeightStored.set(addr, 0);
    }

    let timestamp = startTimestamp;
    let rewardPerWeight = 0;

    // Daily snapshot tracking
    const dailySnapshots: DailySnapshot[] = [];
    const SECONDS_PER_DAY = 86400;
    // Next day boundary = next midnight UTC after startTimestamp
    let nextDayBoundary =
      Math.floor(startTimestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY +
      SECONDS_PER_DAY;

    // Calculate initial boosts and total weight
    let boosts = await strategy.calculateBoosts(users, timestamp);
    let totalWeight = this.sumWeights(users, strategy, boosts);

    const updateRewardPerWeight = (evtTime: number) => {
      if (totalWeight > 0) {
        const deltaTime = evtTime - timestamp;
        rewardPerWeight += (deltaTime * rewardRate) / totalWeight;
      }
    };

    /** Credit all users up to a boundary and snapshot cumulative earned + weights */
    const snapshotAtBoundary = (boundaryTimestamp: number) => {
      updateRewardPerWeight(boundaryTimestamp);
      timestamp = boundaryTimestamp;
      creditAllUsers(boosts);

      const snapWeights = new Map<string, number>();
      const snapBoosts = new Map<string, number>();
      let snapTotalWeight = 0;
      let snapTotalUnboosted = 0;
      for (const [addr, state] of users) {
        const w = strategy.getWeight(state);
        const b = boosts.get(addr) ?? 1;
        snapWeights.set(addr, w);
        snapBoosts.set(addr, b);
        snapTotalWeight += w * b;
        snapTotalUnboosted += w;
      }

      dailySnapshots.push({
        dayTimestamp: boundaryTimestamp,
        earned: new Map(earned),
        weights: snapWeights,
        boosts: snapBoosts,
        totalWeight: snapTotalWeight,
        totalUnboostedWeight: snapTotalUnboosted,
      });
    };

    const creditUser = (addr: string, state: TUserState, currentBoosts: Map<string, number>) => {
      const boost = currentBoosts.get(addr) ?? 1;
      const weight = strategy.getWeight(state);
      const stored = rewardPerWeightStored.get(addr) ?? 0;
      const delta = (rewardPerWeight - stored) * weight * boost;

      earned.set(addr, (earned.get(addr) ?? 0) + delta);
      rewardPerWeightStored.set(addr, rewardPerWeight);
    };

    const creditAllUsers = (currentBoosts: Map<string, number>) => {
      for (const [addr, state] of users) {
        creditUser(addr, state, currentBoosts);
      }
    };

    // Process events chronologically
    // Sequence matches the original processors exactly:
    //   1. updateRewardPerWeight
    //   2. Ensure new user exists (with 0 weight) before boost calc
    //   3. Calculate boosts (new user present but 0 weight)
    //   4. Credit all users
    //   5. Apply state change
    //   6. Recalculate totalWeight with fresh boosts
    for (const event of events) {

      // Snapshot at any day boundaries between the current timestamp and this event
      while (nextDayBoundary <= event.timestamp && nextDayBoundary <= endTimestamp) {
        snapshotAtBoundary(nextDayBoundary);
        nextDayBoundary += SECONDS_PER_DAY;
      }

      updateRewardPerWeight(event.timestamp);
      timestamp = event.timestamp;

      // Pre-create new user before boost calculation (matches old behavior:
      // getOrCreateUserMutate was called BEFORE calculateBoosts)
      const addr = event.address;
      if (addr && !users.has(addr)) {
        users.set(addr, strategy.createDefaultState(addr));
        earned.set(addr, 0);
        rewardPerWeightStored.set(addr, rewardPerWeight);
      }

      // Calculate boosts with new user present (0 weight)
      boosts = await strategy.calculateBoosts(users, timestamp);

      // Determine whether to credit all users or just the affected user
      const creditAll = strategy.shouldCreditAllUsers
        ? strategy.shouldCreditAllUsers(event)
        : true;

      if (creditAll) {
        creditAllUsers(boosts);
      } else if (addr) {
        // Single-user credit: only the affected user
        const state = users.get(addr);
        if (state) {
          creditUser(addr, state, boosts);
        }
      }

      // Credit additional users BEFORE state change (e.g., previous NFT owner
      // in LP position transfers needs to earn at current weight before removal)
      if (strategy.getAdditionalCredits) {
        const additionalAddresses = strategy.getAdditionalCredits(event, users);
        for (const extraAddr of additionalAddresses) {
          const extraState = users.get(extraAddr);
          if (extraState) {
            creditUser(extraAddr, extraState, boosts);
          }
        }
      }

      // Apply the actual state change
      strategy.applyEvent(event, users);

      // Initialize tracking for any users added by applyEvent
      for (const [a] of users) {
        if (!earned.has(a)) {
          earned.set(a, 0);
          rewardPerWeightStored.set(a, rewardPerWeight);
        }
      }

      // Recalculate total weight with fresh boosts
      boosts = await strategy.calculateBoosts(users, timestamp);
      totalWeight = this.sumWeights(users, strategy, boosts);
    }

    // Snapshot any remaining day boundaries between last event and endTimestamp
    while (nextDayBoundary <= endTimestamp) {
      snapshotAtBoundary(nextDayBoundary);
      nextDayBoundary += SECONDS_PER_DAY;
    }

    // Final crediting up to end timestamp
    // Note: use last event's timestamp for boost calculation, NOT endTimestamp.
    // This matches the original processors which use a closure over `timestamp`
    // (set to the last event's time), not the end time.
    updateRewardPerWeight(endTimestamp);
    boosts = await strategy.calculateBoosts(users, timestamp);
    creditAllUsers(boosts);

    // Sanity: remove negative earned (shouldn't happen but matches existing behavior)
    for (const [addr, amount] of earned) {
      if (amount < 0) {
        throw new Error(`Negative earned amount for user ${addr}`);
      }
    }

    return { earned, dailySnapshots };
  }

  private sumWeights<TEvent extends StrategyEvent, TUserState>(
    users: Map<string, TUserState>,
    strategy: RewardStrategy<TEvent, TUserState>,
    boosts: Map<string, number>
  ): number {
    let total = 0;
    for (const [addr, state] of users) {
      const boost = boosts.get(addr) ?? 1;
      total += strategy.getWeight(state) * boost;
    }
    return total;
  }
}
