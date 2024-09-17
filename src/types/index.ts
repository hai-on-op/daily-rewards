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
