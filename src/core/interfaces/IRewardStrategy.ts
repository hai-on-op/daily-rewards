export interface BlockRange {
  startBlock: number;
  endBlock: number;
}

export interface StrategyEvent {
  timestamp: number;
  address?: string;
}

export interface RewardStrategy<
  TEvent extends StrategyEvent,
  TUserState
> {
  readonly name: string;

  getInitialUsers(blockRange: BlockRange): Promise<Map<string, TUserState>>;

  getEvents(blockRange: BlockRange): Promise<TEvent[]>;

  getWeight(state: TUserState): number;

  createDefaultState(address: string): TUserState;

  applyEvent(
    event: TEvent,
    users: Map<string, TUserState>
  ): void;

  calculateBoosts(
    users: Map<string, TUserState>,
    timestamp: number
  ): Promise<Map<string, number>>;
}
