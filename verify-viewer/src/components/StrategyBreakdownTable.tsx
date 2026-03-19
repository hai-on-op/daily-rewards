import React from 'react';
import { DetailedPositions, PoolTotals } from '../types';
import { formatTokenAmount } from '../utils/format';

interface Props {
  token: string;
  run1Strategy?: Record<string, Record<string, number>>;
  run2Strategy?: Record<string, Record<string, number>>;
  run1Positions?: DetailedPositions;
  run2Positions?: DetailedPositions;
  run1Totals?: PoolTotals;
  run2Totals?: PoolTotals;
}

interface RowData {
  strategy: string;
  position: number;
  totalPool: number;
  share: number;
  boost: number;
  run1Earned: number;
  run2Earned: number;
  delta: number;
}

/**
 * Map strategy name to user position and total pool for that strategy
 */
function getPositionAndPool(
  strategy: string,
  positions: DetailedPositions | undefined,
  totals: PoolTotals | undefined
): { position: number; totalPool: number; boost: number } {
  if (!positions || !totals) return { position: 0, totalPool: 0, boost: 1 };

  const boosts = positions.boosts || {};

  if (strategy === 'minter') {
    return {
      position: positions.minter?.totalDebt || 0,
      totalPool: totals.minterDebt || 0,
      boost: boosts.minter || 1,
    };
  }

  if (strategy === 'haiVELO' || strategy === 'haiVELO-historical') {
    return {
      position: positions.haivelo?.collateral || 0,
      totalPool: totals.haiveloCollateral || 0,
      boost: boosts.haivelo || 1,
    };
  }

  if (strategy === 'haiAERO') {
    return {
      position: positions.haiaero?.collateral || 0,
      totalPool: totals.haiaeroCollateral || 0,
      boost: boosts.haiaero || 1,
    };
  }

  if (strategy === 'lpStaking') {
    // Sum across all staking types
    const lpStaking = positions.lpStaking || {};
    const position = Object.values(lpStaking).reduce((s, v) => s + v, 0);
    const totalPool = Object.values(totals.lpStaking || {}).reduce((s, v) => s + v, 0);
    // Use max boost across staking types
    const lpBoosts = Object.keys(lpStaking)
      .map((type) => boosts[`lpStaking_${type}`] || 1);
    const boost = lpBoosts.length > 0 ? Math.max(...lpBoosts) : 1;
    return { position, totalPool, boost };
  }

  if (strategy === 'LP' || strategy === 'LP-historical') {
    return {
      position: positions.lp?.liquidity || 0,
      totalPool: totals.lpLiquidity || 0,
      boost: boosts.lp || 1,
    };
  }

  return { position: 0, totalPool: 0, boost: 1 };
}

function strategyDisplayName(strategy: string): string {
  switch (strategy) {
    case 'minter': return 'Minter (debt)';
    case 'haiVELO': return 'haiVELO deposit';
    case 'haiVELO-historical': return 'haiVELO (historical)';
    case 'haiAERO': return 'haiAERO deposit';
    case 'lpStaking': return 'LP Staking';
    case 'LP': return 'Uniswap LP';
    case 'LP-historical': return 'Uniswap LP (historical)';
    default: return strategy;
  }
}

export default function StrategyBreakdownTable({
  token,
  run1Strategy,
  run2Strategy,
  run1Positions,
  run2Positions,
  run1Totals,
  run2Totals,
}: Props) {
  // Collect all strategies that have rewards for this token
  const allStrategies = new Set<string>();
  if (run1Strategy) {
    for (const [strat, tokens] of Object.entries(run1Strategy)) {
      if (tokens[token]) allStrategies.add(strat);
    }
  }
  if (run2Strategy) {
    for (const [strat, tokens] of Object.entries(run2Strategy)) {
      if (tokens[token]) allStrategies.add(strat);
    }
  }

  if (allStrategies.size === 0) return null;

  const rows: RowData[] = Array.from(allStrategies).map((strategy) => {
    const run1Earned = run1Strategy?.[strategy]?.[token] || 0;
    const run2Earned = run2Strategy?.[strategy]?.[token] || 0;

    // Use run2 positions/totals for the current snapshot
    const { position, totalPool, boost } = getPositionAndPool(
      strategy,
      run2Positions || run1Positions,
      run2Totals || run1Totals
    );

    const share = totalPool > 0 ? position / totalPool : 0;

    return {
      strategy,
      position,
      totalPool,
      share,
      boost,
      run1Earned,
      run2Earned,
      delta: run2Earned - run1Earned,
    };
  });

  // Sort by delta descending
  rows.sort((a, b) => b.delta - a.delta);

  const totalDelta = rows.reduce((s, r) => s + r.delta, 0);

  return (
    <div className="strategy-breakdown">
      <h4>
        {token} Rewards by Strategy
        <span
          className="tooltip-trigger"
          data-tip={`Shows how ${token} rewards are distributed across strategies. Position = your stake, Pool = total across all users, Share = your %, Boost = KITE multiplier, Delta = new rewards earned between runs.`}
        >?</span>
        <span className={`mono ${totalDelta > 0 ? 'positive' : totalDelta < 0 ? 'negative' : ''}`} style={{ marginLeft: 8, fontSize: '0.8rem' }}>
          (delta: {totalDelta > 0 ? '+' : ''}{formatTokenAmount(totalDelta)})
        </span>
      </h4>
      <table className="detail-table strategy-table">
        <thead>
          <tr>
            <th>Strategy</th>
            <th className="right">Your Position</th>
            <th className="right">Total Pool</th>
            <th className="right">Share</th>
            <th className="right">Boost</th>
            <th className="right">Run 1</th>
            <th className="right">Run 2</th>
            <th className="right">Delta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.strategy}>
              <td>{strategyDisplayName(row.strategy)}</td>
              <td className="mono right">{row.position > 0 ? formatTokenAmount(row.position) : <span className="dim">-</span>}</td>
              <td className="mono right">{row.totalPool > 0 ? formatTokenAmount(row.totalPool) : <span className="dim">-</span>}</td>
              <td className="mono right">{row.share > 0 ? (row.share * 100).toFixed(2) + '%' : <span className="dim">-</span>}</td>
              <td className="mono right">{row.boost > 1 ? <span style={{ color: row.boost >= 1.5 ? '#22c55e' : '#eab308' }}>{row.boost.toFixed(2)}x</span> : <span className="dim">1.00x</span>}</td>
              <td className="mono right">{row.run1Earned > 0 ? formatTokenAmount(row.run1Earned) : <span className="dim">-</span>}</td>
              <td className="mono right">{row.run2Earned > 0 ? formatTokenAmount(row.run2Earned) : <span className="dim">-</span>}</td>
              <td className={`mono right ${row.delta > 0 ? 'positive' : row.delta < 0 ? 'negative' : ''}`}>
                {row.delta !== 0 ? ((row.delta > 0 ? '+' : '') + formatTokenAmount(row.delta)) : <span className="dim">-</span>}
              </td>
            </tr>
          ))}
          <tr className="totals-row">
            <td><strong>Total</strong></td>
            <td colSpan={4}></td>
            <td className="mono right"><strong>{formatTokenAmount(rows.reduce((s, r) => s + r.run1Earned, 0))}</strong></td>
            <td className="mono right"><strong>{formatTokenAmount(rows.reduce((s, r) => s + r.run2Earned, 0))}</strong></td>
            <td className={`mono right ${totalDelta > 0 ? 'positive' : totalDelta < 0 ? 'negative' : ''}`}>
              <strong>{totalDelta > 0 ? '+' : ''}{formatTokenAmount(totalDelta)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
