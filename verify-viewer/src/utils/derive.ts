import { Report, UserRecord } from '../types';

export interface DerivedData {
  flaggedUsers: UserRecord[];
  healthyUsers: UserRecord[];
  positionTypeCounts: { name: string; count: number }[];
  allTokens: string[];
  totalRewardsByToken: Record<string, { run1: number; run2: number }>;
}

export function deriveData(report: Report): DerivedData {
  const flaggedUsers: UserRecord[] = [];
  const healthyUsers: UserRecord[] = [];

  // Position type counting
  const posMap = new Map<string, number>();
  const tokenTotals: Record<string, { run1: number; run2: number }> = {};
  const tokenSet = new Set<string>();

  for (const user of report.users) {
    // Flagged = earned rewards between runs (delta > 0) but had no position
    const delta = userRewardDelta(user);
    const hasPositiveDelta = Object.values(delta).some((d) => d > 0);
    const noPosition = !user.run1HasPosition && !user.run2HasPosition;
    const isFlagged = hasPositiveDelta && noPosition;
    if (isFlagged) flaggedUsers.push(user);
    else healthyUsers.push(user);

    // Count position types from run2 (most recent)
    for (const posType of Object.keys(user.run2Positions)) {
      posMap.set(posType, (posMap.get(posType) || 0) + 1);
    }
    // Also include run1-only position types
    for (const posType of Object.keys(user.run1Positions)) {
      if (!user.run2Positions[posType]) {
        posMap.set(posType, (posMap.get(posType) || 0) + 1);
      }
    }

    // Aggregate rewards by token
    for (const [token, val] of Object.entries(user.run1Rewards)) {
      tokenSet.add(token);
      if (!tokenTotals[token]) tokenTotals[token] = { run1: 0, run2: 0 };
      tokenTotals[token].run1 += parseFloat(val) || 0;
    }
    for (const [token, val] of Object.entries(user.run2Rewards)) {
      tokenSet.add(token);
      if (!tokenTotals[token]) tokenTotals[token] = { run1: 0, run2: 0 };
      tokenTotals[token].run2 += parseFloat(val) || 0;
    }
  }

  const positionTypeCounts = Array.from(posMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    flaggedUsers,
    healthyUsers,
    positionTypeCounts,
    allTokens: Array.from(tokenSet).sort(),
    totalRewardsByToken: tokenTotals,
  };
}

export function userRewardDelta(user: UserRecord): Record<string, number> {
  const delta: Record<string, number> = {};
  const allTokens = new Set([
    ...Object.keys(user.run1Rewards),
    ...Object.keys(user.run2Rewards),
  ]);
  allTokens.forEach((token) => {
    const r1 = parseFloat(user.run1Rewards[token] || '0');
    const r2 = parseFloat(user.run2Rewards[token] || '0');
    delta[token] = r2 - r1;
  });
  return delta;
}
