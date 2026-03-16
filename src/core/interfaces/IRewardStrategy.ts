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

  /**
   * Return additional user addresses that should be credited BEFORE applyEvent
   * modifies their state. Used for NFT transfers where the previous owner
   * needs to earn rewards at their current weight before the position is removed.
   */
  getAdditionalCredits?(
    event: TEvent,
    users: Map<string, TUserState>
  ): string[];

  /**
   * Whether this event should credit all users before applying, or only the
   * affected user. Default behavior (if not implemented): credit all users.
   *
   * The minter's DELTA_DEBT events only credit the single affected user in
   * the old code. This produces slightly different results from crediting all
   * users because boost values shift between events.
   */
  shouldCreditAllUsers?(event: TEvent): boolean;

  calculateBoosts(
    users: Map<string, TUserState>,
    timestamp: number
  ): Promise<Map<string, number>>;
}
