import { ExactRewards } from './types';
import { address, amount } from './ledger';
/** Merge BEFORE claim subtraction; preserves cumulative legacy and new entitlements. */
export function mergeExactRewards(...maps: ExactRewards[]): ExactRewards {
  const totals: Record<string, Map<string, bigint>> = {};
  for (const map of maps) for (const [token, rows] of Object.entries(map)) {
    totals[token] ||= new Map();
    for (const row of rows) { const owner = address(row.address); totals[token].set(owner, (totals[token].get(owner) || BigInt(0)) + amount(row.earned)); }
  }
  return Object.fromEntries(Object.entries(totals).map(([token, rows]) => [token, [...rows].sort(([a], [b]) => a.localeCompare(b)).map(([owner, earned]) => ({ address: owner, earned: earned.toString() }))]));
}
