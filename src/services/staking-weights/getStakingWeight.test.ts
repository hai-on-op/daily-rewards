import { LpPosition } from "../../types";
import {
  getStakingWeightForLPPositions,
  getStakingWeightForDebt,
} from "./getStakingWeight";

describe("getStakingWeightForLPPositions", () => {
  it("should return 0 for an empty array of positions", () => {
    expect(getStakingWeightForLPPositions([])).toBe(0);
  });

  it("should sum liquidity for full range positions", () => {
    const positions: LpPosition[] = [
      { tokenId: 1, liquidity: 1000, lowerTick: -887220, upperTick: 887220 },
      { tokenId: 2, liquidity: 2000, lowerTick: -887220, upperTick: 887220 },
    ];
    expect(getStakingWeightForLPPositions(positions)).toBe(3000);
  });

  it("should ignore positions that are not full range", () => {
    const positions: LpPosition[] = [
      { tokenId: 1, liquidity: 1000, lowerTick: -887220, upperTick: 887220 },
      { tokenId: 2, liquidity: 2000, lowerTick: -887220, upperTick: 887219 },
      { tokenId: 3, liquidity: 3000, lowerTick: -887219, upperTick: 887220 },
    ];
    expect(getStakingWeightForLPPositions(positions)).toBe(1000);
  });
});

describe("getStakingWeightForDebt", () => {
  it("should return debt when withBridge is false", () => {
    expect(getStakingWeightForDebt(1000, 500, 250, false)).toBe(1000);
  });

  it("should return debt when effectiveBridgedTokens is undefined", () => {
    expect(getStakingWeightForDebt(1000, 500)).toBe(1000);
  });

  it("should return debt when collateral is undefined", () => {
    expect(getStakingWeightForDebt(1000, undefined, 250, true)).toBe(1000);
  });

  it("should calculate rewardable debt correctly when bridged ratio is less than 1", () => {
    expect(getStakingWeightForDebt(1000, 1000, 500, true)).toBe(500);
  });

  it("should cap rewardable debt at the total debt when bridged ratio is greater than 1", () => {
    expect(getStakingWeightForDebt(1000, 1000, 1500, true)).toBe(1000);
  });

  it("should return 0 when collateral and effectiveBridgedTokens are both 0", () => {
    expect(getStakingWeightForDebt(1000, 0, 0, true)).toBe(0);
  });

  it("should handle edge case where debt is 0", () => {
    expect(getStakingWeightForDebt(0, 1000, 500, true)).toBe(0);
  });
});
