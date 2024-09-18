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
  debt: number;
  lpPositions: LpPosition[];
  stakingWeight: number;
  rewardPerWeightStored: number;
  earned: number;
};

// Main data structure
export type UserList = {
  [address: string]: UserAccount;
};
