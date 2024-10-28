export interface RawPosition {
  id: string;
  owner: string;
  liquidity: string;
  tickLower: {
    tickIdx: string;
  };
  tickUpper: {
    tickIdx: string;
  };
}

export interface ProcessedPosition {
  lowerTick: number;
  upperTick: number;
  liquidity: number;
  tokenId: number;
}

export interface UserPositions {
  [owner: string]: {
    positions: ProcessedPosition[];
  };
}

export type LpPosition = ProcessedPosition;

// For a single user
export type UserAccount = {
  address: string;
  debt: number;
  collateral: number;
  lpPositions: LpPosition[];
  stakingWeight: number;
  rewardPerWeightStored: number;
  earned: number;
  totalBridgedTokens: number;
  usedBridgedTokens: number;
};

// Main data structure
export type UserList = {
  [address: string]: UserAccount;
};

// Event Types
export enum RewardEventType {
  DELTA_DEBT,
  POOL_POSITION_UPDATE,
  POOL_SWAP,
  UPDATE_ACCUMULATED_RATE,
}

export type RewardEvent = {
  type: RewardEventType;
  address?: string;
  value: number | LpPosition;
  complementaryValue?: number;
  timestamp: number;
  createdAtBlock: number;
  logIndex: number;
  cType?: string;
};

export type Rates = {
  [key: string]: number; // or whatever type the values should be
};
