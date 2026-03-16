import React from 'react';
import { DetailedPositions } from '../types';
import { formatTokenAmount } from '../utils/format';

interface Props {
  positions?: DetailedPositions;
  fallbackPositions: Record<string, string>;
  label: string;
}

function BoostBadge({ value }: { value: number }) {
  const color = value >= 1.8 ? '#22c55e' : value >= 1.3 ? '#eab308' : '#6b7280';
  return (
    <span className="boost-badge" style={{ color }}>
      {value.toFixed(2)}x
    </span>
  );
}

export default function PositionBreakdown({ positions, fallbackPositions, label }: Props) {
  // Fall back to old flat format if no detailed data
  if (!positions) {
    const keys = Object.keys(fallbackPositions);
    if (keys.length === 0) return <p className="dim">No positions</p>;
    return (
      <ul className="position-list">
        {keys.map((type) => (
          <li key={type}>
            <strong>{type}</strong>: {fallbackPositions[type]}
          </li>
        ))}
      </ul>
    );
  }

  const hasKite = positions.kiteStaked !== undefined && positions.kiteStaked > 0;

  return (
    <div className="position-breakdown">
      {/* KITE Staking Header */}
      {hasKite && (
        <div className="position-kite-header">
          <span className="kite-icon">KITE</span>
          <span className="mono">{formatTokenAmount(positions.kiteStaked!)}</span>
          <span className="dim">
            ({((positions.kiteShare || 0) * 100).toFixed(2)}% share)
          </span>
        </div>
      )}

      {/* Minter */}
      {positions.minter && (
        <div className="position-card">
          <div className="position-card-header">
            <span>Minter</span>
            {positions.boosts?.minter && <BoostBadge value={positions.boosts.minter} />}
          </div>
          <div className="position-card-body">
            {Object.entries(positions.minter.byCollateral)
              .sort(([, a], [, b]) => b - a)
              .map(([cType, debt]) => (
                <div key={cType} className="position-row">
                  <span className="position-label">{cType}</span>
                  <span className="mono">{formatTokenAmount(debt)}</span>
                </div>
              ))}
            <div className="position-row position-total">
              <span className="position-label">Total Debt</span>
              <span className="mono">{formatTokenAmount(positions.minter.totalDebt)}</span>
            </div>
          </div>
        </div>
      )}

      {/* haiVELO */}
      {positions.haivelo && (
        <div className="position-card">
          <div className="position-card-header">
            <span>haiVELO</span>
            {positions.boosts?.haivelo && <BoostBadge value={positions.boosts.haivelo} />}
          </div>
          <div className="position-card-body">
            <div className="position-row">
              <span className="position-label">Collateral</span>
              <span className="mono">{formatTokenAmount(positions.haivelo.collateral)}</span>
            </div>
          </div>
        </div>
      )}

      {/* haiAERO */}
      {positions.haiaero && (
        <div className="position-card">
          <div className="position-card-header">
            <span>haiAERO</span>
            {positions.boosts?.haiaero && <BoostBadge value={positions.boosts.haiaero} />}
          </div>
          <div className="position-card-body">
            <div className="position-row">
              <span className="position-label">Collateral</span>
              <span className="mono">{formatTokenAmount(positions.haiaero.collateral)}</span>
            </div>
          </div>
        </div>
      )}

      {/* LP Staking */}
      {positions.lpStaking && Object.keys(positions.lpStaking).length > 0 && (
        <div className="position-card">
          <div className="position-card-header">
            <span>LP Staking</span>
          </div>
          <div className="position-card-body">
            {Object.entries(positions.lpStaking).map(([type, amount]) => (
              <div key={type} className="position-row">
                <span className="position-label">{type}</span>
                <span className="mono">{formatTokenAmount(amount)}</span>
                {positions.boosts?.[`lpStaking_${type}`] && (
                  <BoostBadge value={positions.boosts[`lpStaking_${type}`]} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uniswap LP */}
      {positions.lp && (
        <div className="position-card">
          <div className="position-card-header">
            <span>Uniswap LP</span>
            {positions.boosts?.lp && <BoostBadge value={positions.boosts.lp} />}
          </div>
          <div className="position-card-body">
            <div className="position-row">
              <span className="position-label">Liquidity</span>
              <span className="mono">{positions.lp.liquidity.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* No positions at all */}
      {!positions.minter &&
        !positions.haivelo &&
        !positions.haiaero &&
        !positions.lpStaking &&
        !positions.lp && <p className="dim">No positions</p>}
    </div>
  );
}
