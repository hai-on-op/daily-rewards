import { RewardStrategy, StrategyEvent } from "../interfaces/IRewardStrategy";

export interface DistributorConfig {
  startTimestamp: number;
  endTimestamp: number;
  rewardAmount: number;
}

export interface DistributionResult {
  earned: Map<string, number>;
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
      return { earned };
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

    // Calculate initial boosts and total weight
    let boosts = await strategy.calculateBoosts(users, timestamp);
    let totalWeight = this.sumWeights(users, strategy, boosts);

    const updateRewardPerWeight = (evtTime: number) => {
      if (totalWeight > 0) {
        const deltaTime = evtTime - timestamp;
        rewardPerWeight += (deltaTime * rewardRate) / totalWeight;
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

    return { earned };
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
