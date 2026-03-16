import { TimeWeightedDistributor, DistributorConfig } from "./TimeWeightedDistributor";
import { RewardStrategy, StrategyEvent } from "../interfaces/IRewardStrategy";

// --- Minimal mock types ---

interface MockState {
  address: string;
  weight: number;
}

interface MockEvent extends StrategyEvent {
  address: string;
  deltaWeight: number;
}

// --- Mock strategy: simple weight-based, no boost by default ---

function createMockStrategy(
  boostOverrides?: Map<string, number>
): RewardStrategy<MockEvent, MockState> {
  return {
    name: "mock",

    async getInitialUsers() {
      return new Map();
    },

    async getEvents() {
      return [];
    },

    getWeight(state: MockState): number {
      return state.weight;
    },

    createDefaultState(address: string): MockState {
      return { address, weight: 0 };
    },

    applyEvent(event: MockEvent, users: Map<string, MockState>) {
      let user = users.get(event.address);
      if (!user) {
        user = { address: event.address, weight: 0 };
        users.set(event.address, user);
      }
      user.weight += event.deltaWeight;
      if (user.weight < 0 && user.weight > -0.01) {
        user.weight = 0;
      }
    },

    async calculateBoosts(
      users: Map<string, MockState>
    ): Promise<Map<string, number>> {
      const boosts = new Map<string, number>();
      for (const [addr] of users) {
        boosts.set(addr, boostOverrides?.get(addr) ?? 1);
      }
      return boosts;
    },
  };
}

describe("TimeWeightedDistributor", () => {
  const distributor = new TimeWeightedDistributor();

  const baseConfig: DistributorConfig = {
    startTimestamp: 0,
    endTimestamp: 1000,
    rewardAmount: 1000,
  };

  it("single user, no events: earns full reward", async () => {
    const strategy = createMockStrategy();
    const users = new Map<string, MockState>([
      ["alice", { address: "alice", weight: 100 }],
    ]);

    const result = await distributor.distribute(strategy, [], users, baseConfig);

    expect(result.earned.get("alice")).toBeCloseTo(1000, 5);
  });

  it("two users, equal weight, no events: each earns 50%", async () => {
    const strategy = createMockStrategy();
    const users = new Map<string, MockState>([
      ["alice", { address: "alice", weight: 100 }],
      ["bob", { address: "bob", weight: 100 }],
    ]);

    const result = await distributor.distribute(strategy, [], users, baseConfig);

    expect(result.earned.get("alice")).toBeCloseTo(500, 5);
    expect(result.earned.get("bob")).toBeCloseTo(500, 5);
  });

  it("two users, unequal weight: rewards proportional to weight", async () => {
    const strategy = createMockStrategy();
    const users = new Map<string, MockState>([
      ["alice", { address: "alice", weight: 300 }],
      ["bob", { address: "bob", weight: 100 }],
    ]);

    const result = await distributor.distribute(strategy, [], users, baseConfig);

    expect(result.earned.get("alice")).toBeCloseTo(750, 5);
    expect(result.earned.get("bob")).toBeCloseTo(250, 5);
  });

  it("mid-period join: new user only earns from join time", async () => {
    const strategy = createMockStrategy();
    const users = new Map<string, MockState>([
      ["alice", { address: "alice", weight: 100 }],
    ]);

    // Bob joins at timestamp 500 (halfway) with equal weight
    const events: MockEvent[] = [
      { timestamp: 500, address: "bob", deltaWeight: 100 },
    ];

    const result = await distributor.distribute(
      strategy,
      events,
      users,
      baseConfig
    );

    // Alice earns full first half (500) + half of second half (250) = 750
    // Bob earns half of second half = 250
    expect(result.earned.get("alice")).toBeCloseTo(750, 5);
    expect(result.earned.get("bob")).toBeCloseTo(250, 5);
  });

  it("mid-period leave: user earns nothing after exit", async () => {
    const strategy = createMockStrategy();
    const users = new Map<string, MockState>([
      ["alice", { address: "alice", weight: 100 }],
      ["bob", { address: "bob", weight: 100 }],
    ]);

    // Bob leaves at timestamp 500
    const events: MockEvent[] = [
      { timestamp: 500, address: "bob", deltaWeight: -100 },
    ];

    const result = await distributor.distribute(
      strategy,
      events,
      users,
      baseConfig
    );

    // First half: Alice 250, Bob 250
    // Second half: Alice 500 (sole earner)
    // Total: Alice 750, Bob 250
    expect(result.earned.get("alice")).toBeCloseTo(750, 5);
    expect(result.earned.get("bob")).toBeCloseTo(250, 5);
  });

  it("weight change: user earns more after increasing weight", async () => {
    const strategy = createMockStrategy();
    const users = new Map<string, MockState>([
      ["alice", { address: "alice", weight: 100 }],
      ["bob", { address: "bob", weight: 100 }],
    ]);

    // Alice doubles weight at midpoint
    const events: MockEvent[] = [
      { timestamp: 500, address: "alice", deltaWeight: 100 },
    ];

    const result = await distributor.distribute(
      strategy,
      events,
      users,
      baseConfig
    );

    // First half: Alice 250, Bob 250
    // Second half: Alice has weight 200, Bob 100 → Alice gets 2/3, Bob 1/3
    // Second half rewards = 500: Alice 333.33, Bob 166.67
    // Total: Alice ~583.33, Bob ~416.67
    expect(result.earned.get("alice")).toBeCloseTo(583.333, 2);
    expect(result.earned.get("bob")).toBeCloseTo(416.667, 2);
  });

  it("empty users: returns empty earned map", async () => {
    const strategy = createMockStrategy();
    const users = new Map<string, MockState>();

    const result = await distributor.distribute(strategy, [], users, baseConfig);

    expect(result.earned.size).toBe(0);
  });

  it("zero reward amount: all earned values are 0", async () => {
    const strategy = createMockStrategy();
    const users = new Map<string, MockState>([
      ["alice", { address: "alice", weight: 100 }],
    ]);

    const result = await distributor.distribute(strategy, [], users, {
      ...baseConfig,
      rewardAmount: 0,
    });

    expect(result.earned.get("alice")).toBeCloseTo(0, 10);
  });

  it("boost multiplier: boosted user earns proportionally more", async () => {
    const boosts = new Map<string, number>([
      ["alice", 2],
      ["bob", 1],
    ]);
    const strategy = createMockStrategy(boosts);

    const users = new Map<string, MockState>([
      ["alice", { address: "alice", weight: 100 }],
      ["bob", { address: "bob", weight: 100 }],
    ]);

    const result = await distributor.distribute(strategy, [], users, baseConfig);

    // Alice effective weight = 100 * 2 = 200, Bob = 100 * 1 = 100
    // Total effective = 300
    // Alice earns 2/3 * 1000 = 666.67, Bob earns 1/3 * 1000 = 333.33
    expect(result.earned.get("alice")).toBeCloseTo(666.667, 2);
    expect(result.earned.get("bob")).toBeCloseTo(333.333, 2);
  });

  it("total distributed equals reward amount", async () => {
    const strategy = createMockStrategy();
    const users = new Map<string, MockState>([
      ["alice", { address: "alice", weight: 50 }],
      ["bob", { address: "bob", weight: 150 }],
      ["charlie", { address: "charlie", weight: 300 }],
    ]);

    const events: MockEvent[] = [
      { timestamp: 200, address: "alice", deltaWeight: 50 },
      { timestamp: 600, address: "bob", deltaWeight: -50 },
      { timestamp: 800, address: "dave", deltaWeight: 200 },
    ];

    const result = await distributor.distribute(
      strategy,
      events,
      users,
      baseConfig
    );

    const total = Array.from(result.earned.values()).reduce(
      (sum, v) => sum + v,
      0
    );
    expect(total).toBeCloseTo(1000, 2);
  });
});
