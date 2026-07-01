import { LpPosition } from "../../types";

const RAI_IS_TOKEN_0 = true;

// Full range positions on OP Uniswap v3
const fullRangeLowerTick = -887220;
const fullRangeUpperTick = 887220;

export const getStakingWeightForLPPositions = (positions: LpPosition[]) => {
  // Remove positions that are not full range
  const filteredPositions = positions.filter((p) => {
    return (
      p.lowerTick === fullRangeLowerTick && p.upperTick === fullRangeUpperTick
    );
  });

  const totalLiquidity = filteredPositions.reduce((acc, p) => {
    return acc + (isFullRange(p) ? p.liquidity : 0);
  }, 0);
  return totalLiquidity;
};

export const getStakingWeightForDebt = (
  debt: number,
  collateral?: number,
  effectiveBridgedTokens?: number,
  withBridge?: boolean
): number => {
  if (
    !withBridge ||
    effectiveBridgedTokens === undefined ||
    collateral === undefined
  ) {
    return debt;
  }

  // Calculate the ratio of bridged collateral to total collateral
  const bridgedRatio =
    effectiveBridgedTokens === 0 && collateral === 0
      ? 0
      : Math.min(effectiveBridgedTokens / collateral, 1);

  // Calculate the rewardable debt
  const rewardableDebt = Math.min(debt, debt * bridgedRatio);

  return rewardableDebt;
};

const isFullRange = (lp: LpPosition) =>
  lp.lowerTick === fullRangeLowerTick && lp.upperTick === fullRangeUpperTick;
