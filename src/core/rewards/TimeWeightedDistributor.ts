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

  // Time-weighted averages for this day (self-consistent with earned deltas):
  /** addr → time-weighted avg(weight * boost) over this day */
  avgWeights: Map<string, number>;
  /** addr → time-weighted avg(weight) over this day */
  avgUnboostedWeights: Map<string, number>;
  /** addr → time-weighted avg position (getWeight) over this day — real units */
  avgPositions: Map<string, number>;
  /** Time-weighted avg total position (sum of getWeight across all users) — real units */
  avgTotalPosition: number;
  /** Time-weighted avg total boosted weight over this day */
  avgTotalWeight: number;
  /** Time-weighted avg total unboosted weight over this day */
  avgTotalUnboostedWeight: number;
  /** Duration of this day in seconds (may be < 86400 for first/last day) */
  dayDuration: number;

  // Point-in-time at boundary (informational):
  /** addr → getWeight(state) at this boundary */
  weights: Map<string, number>;
  /** addr → boost at this boundary */
  boosts: Map<string, number>;
  /** Sum of weight * boost at this boundary */
  totalWeight: number;
  /** Sum of weight at this boundary */
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
    let unboostedTotalWeight = this.sumUnboostedWeights(users, strategy);

    // Time-weighted integral accumulators (reset at each day boundary)
    let dayStartTs = startTimestamp;
    let totalBoostedIntegral = 0;
    let totalUnboostedIntegral = 0;
    // Per-user unboosted weight integrals (for computing avg position per day)
    const userWeightIntegrals = new Map<string, number>();
    for (const [addr] of users) {
      userWeightIntegrals.set(addr, 0);
    }
    // Previous cumulative earned snapshot (for computing per-day deltas at boundary)
    let prevEarnedSnapshot = new Map<string, number>();
    for (const [addr] of users) {
      prevEarnedSnapshot.set(addr, 0);
    }

    /** Advance time: update rewardPerWeight AND accumulate weight integrals */
    const advanceTime = (newTimestamp: number) => {
      const dt = newTimestamp - timestamp;
      if (dt > 0) {
        if (totalWeight > 0) {
          rewardPerWeight += (dt * rewardRate) / totalWeight;
        }
        totalBoostedIntegral += totalWeight * dt;
        totalUnboostedIntegral += unboostedTotalWeight * dt;
        // Per-user unboosted weight integrals
        for (const [addr, state] of users) {
          const w = strategy.getWeight(state);
          userWeightIntegrals.set(addr, (userWeightIntegrals.get(addr) ?? 0) + w * dt);
        }
      }
    };

    /** Credit all users up to a boundary and snapshot with time-weighted averages */
    const snapshotAtBoundary = (boundaryTimestamp: number) => {
      advanceTime(boundaryTimestamp);
      timestamp = boundaryTimestamp;
      creditAllUsers(boosts);

      // Point-in-time weights at boundary
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

      // Time-weighted averages for this day
      const dayDuration = boundaryTimestamp - dayStartTs;
      const avgTotalWeight = dayDuration > 0 ? totalBoostedIntegral / dayDuration : 0;
      const avgTotalUnboostedWeight = dayDuration > 0 ? totalUnboostedIntegral / dayDuration : 0;

      // Derive per-user avg weights from their earned deltas.
      // Use actual sum of earned deltas (not rewardRate * dayDuration, which
      // assumes uniform distribution but the actual pool varies with totalWeight).
      const avgWeightsMap = new Map<string, number>();
      const avgUnboostedMap = new Map<string, number>();

      let actualDayPool = 0;
      for (const [addr] of users) {
        const delta = (earned.get(addr) ?? 0) - (prevEarnedSnapshot.get(addr) ?? 0);
        if (delta > 0) actualDayPool += delta;
      }

      for (const [addr] of users) {
        const currEarned = earned.get(addr) ?? 0;
        const prevEarned = prevEarnedSnapshot.get(addr) ?? 0;
        const dayEarned = currEarned - prevEarned;

        if (actualDayPool > 0 && dayEarned > 0) {
          const userShare = dayEarned / actualDayPool;
          const userAvgBoosted = userShare * avgTotalWeight;
          avgWeightsMap.set(addr, userAvgBoosted);

          // Approximate unboosted using end-of-day boost
          const b = boosts.get(addr) ?? 1;
          avgUnboostedMap.set(addr, b > 0 ? userAvgBoosted / b : 0);
        } else {
          avgWeightsMap.set(addr, 0);
          avgUnboostedMap.set(addr, 0);
        }
      }

      // Compute per-user time-weighted average positions (real units)
      const avgPositionsMap = new Map<string, number>();
      for (const [addr] of users) {
        const integral = userWeightIntegrals.get(addr) ?? 0;
        avgPositionsMap.set(addr, dayDuration > 0 ? integral / dayDuration : 0);
      }

      // Save current earned as prev for next day
      prevEarnedSnapshot = new Map(earned);

      dailySnapshots.push({
        dayTimestamp: boundaryTimestamp,
        earned: new Map(earned),
        avgWeights: avgWeightsMap,
        avgUnboostedWeights: avgUnboostedMap,
        avgPositions: avgPositionsMap,
        avgTotalPosition: avgTotalUnboostedWeight, // sum of getWeight across all users (= unboosted total)
        avgTotalWeight,
        avgTotalUnboostedWeight,
        dayDuration,
        weights: snapWeights,
        boosts: snapBoosts,
        totalWeight: snapTotalWeight,
        totalUnboostedWeight: snapTotalUnboosted,
      });

      // Reset integrals for next day
      dayStartTs = boundaryTimestamp;
      totalBoostedIntegral = 0;
      totalUnboostedIntegral = 0;
      for (const [addr] of users) {
        userWeightIntegrals.set(addr, 0);
      }
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

      advanceTime(event.timestamp);
      timestamp = event.timestamp;

      // Pre-create new user before boost calculation (matches old behavior:
      // getOrCreateUserMutate was called BEFORE calculateBoosts)
      const addr = event.address;
      if (addr && !users.has(addr)) {
        users.set(addr, strategy.createDefaultState(addr));
        earned.set(addr, 0);
        rewardPerWeightStored.set(addr, rewardPerWeight);
        userWeightIntegrals.set(addr, 0);
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
          userWeightIntegrals.set(a, 0);
        }
      }

      // Recalculate total weight with fresh boosts
      boosts = await strategy.calculateBoosts(users, timestamp);
      totalWeight = this.sumWeights(users, strategy, boosts);
      unboostedTotalWeight = this.sumUnboostedWeights(users, strategy);
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
    advanceTime(endTimestamp);
    boosts = await strategy.calculateBoosts(users, timestamp);
    creditAllUsers(boosts);

    // Capture any remaining partial-day rewards in a final snapshot.
    // Without this, rewards earned between the last midnight boundary and
    // endTimestamp are in `earned` but missing from dailySnapshots, causing
    // under-reported totals on epoch boundary days (e.g. the weekly dip).
    if (endTimestamp > dayStartTs) {
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

      const dayDuration = endTimestamp - dayStartTs;
      const avgTotalWeight = dayDuration > 0 ? totalBoostedIntegral / dayDuration : 0;
      const avgTotalUnboostedWeight = dayDuration > 0 ? totalUnboostedIntegral / dayDuration : 0;

      const avgWeightsMap = new Map<string, number>();
      const avgUnboostedMap = new Map<string, number>();

      let actualDayPool = 0;
      for (const [addr] of users) {
        const delta = (earned.get(addr) ?? 0) - (prevEarnedSnapshot.get(addr) ?? 0);
        if (delta > 0) actualDayPool += delta;
      }

      for (const [addr] of users) {
        const currEarned = earned.get(addr) ?? 0;
        const prevEarned = prevEarnedSnapshot.get(addr) ?? 0;
        const dayEarned = currEarned - prevEarned;

        if (actualDayPool > 0 && dayEarned > 0) {
          const userShare = dayEarned / actualDayPool;
          const userAvgBoosted = userShare * avgTotalWeight;
          avgWeightsMap.set(addr, userAvgBoosted);

          const b = boosts.get(addr) ?? 1;
          avgUnboostedMap.set(addr, b > 0 ? userAvgBoosted / b : 0);
        } else {
          avgWeightsMap.set(addr, 0);
          avgUnboostedMap.set(addr, 0);
        }
      }

      const avgPositionsMap = new Map<string, number>();
      for (const [addr] of users) {
        const integral = userWeightIntegrals.get(addr) ?? 0;
        avgPositionsMap.set(addr, dayDuration > 0 ? integral / dayDuration : 0);
      }

      // Key the snapshot at the next midnight boundary so it aligns with
      // the subsequent epoch's first snapshot for the same calendar day.
      dailySnapshots.push({
        dayTimestamp: nextDayBoundary,
        earned: new Map(earned),
        avgWeights: avgWeightsMap,
        avgUnboostedWeights: avgUnboostedMap,
        avgPositions: avgPositionsMap,
        avgTotalPosition: avgTotalUnboostedWeight,
        avgTotalWeight,
        avgTotalUnboostedWeight,
        dayDuration,
        weights: snapWeights,
        boosts: snapBoosts,
        totalWeight: snapTotalWeight,
        totalUnboostedWeight: snapTotalUnboosted,
      });
    }

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

  private sumUnboostedWeights<TEvent extends StrategyEvent, TUserState>(
    users: Map<string, TUserState>,
    strategy: RewardStrategy<TEvent, TUserState>,
  ): number {
    let total = 0;
    for (const [, state] of users) {
      total += strategy.getWeight(state);
    }
    return total;
  }
}
