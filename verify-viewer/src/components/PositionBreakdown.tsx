import React from 'react';
import { DetailedPositions } from '../types';
import { formatTokenAmount } from '../utils/format';

interface Props {
  positions?: DetailedPositions;
  fallbackPositions: Record<string, string>;
  label: string;
}

function Tip({ text }: { text: string }) {
  return (
    <span className="tooltip-trigger" data-tip={text}>
      ?
    </span>
  );
}

function BoostBadge({ value, tip }: { value: number; tip?: string }) {
  const color = value >= 1.8 ? '#22c55e' : value >= 1.3 ? '#eab308' : '#6b7280';
  return (
    <span className="boost-badge" style={{ color }} title={tip}>
      {value.toFixed(2)}x
    </span>
  );
}

export default function PositionBreakdown({ positions, fallbackPositions, label }: Props) {
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
          <Tip text="Amount of KITE staked in sKITE. The share % is your proportion of total KITE staked. Higher share = higher boost multiplier on all strategies." />
        </div>
      )}
      {!hasKite && (
        <div className="position-kite-header dim">
          No KITE staked
          <Tip text="Staking KITE in sKITE gives a boost multiplier (up to 2x) on all reward strategies. Without KITE staked, boost = 1x (no bonus)." />
        </div>
      )}

      {/* Minter */}
      {positions.minter && (
        <div className="position-card">
          <div className="position-card-header">
            <span>
              Minter Debt
              <Tip text="Debt positions in GEB safes. Rewards are distributed proportional to your debt relative to total system debt. Each collateral type has its own reward pool." />
            </span>
            {positions.boosts?.minter && (
              <BoostBadge
                value={positions.boosts.minter}
                tip={`Minter boost = min(your_debt_share + 1, 2). Your debt share determines your boost. Current: ${positions.boosts.minter.toFixed(3)}x`}
              />
            )}
          </div>
          <div className="position-card-body">
            {Object.entries(positions.minter.byCollateral)
              .sort(([, a], [, b]) => b - a)
              .map(([cType, debt]) => (
                <div key={cType} className="position-row">
                  <span className="position-label" title={`Your debt in the ${cType} collateral type. This earns KITE rewards from the minter reward pool for ${cType}.`}>
                    {cType}
                  </span>
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
            <span>
              haiVELO Collateral
              <Tip text="haiVELO deposited as collateral. Rewards are proportional to your collateral relative to total haiVELO collateral. Earns HAI rewards from deposit-based funding." />
            </span>
            {positions.boosts?.haivelo && (
              <BoostBadge
                value={positions.boosts.haivelo}
                tip={`haiVELO boost = min(kite_share / collateral_share + 1, 2). Staking more KITE relative to your collateral share gives a higher boost.`}
              />
            )}
          </div>
          <div className="position-card-body">
            <div className="position-row">
              <span className="position-label" title="Your haiVELO collateral deposited in the protocol">Collateral</span>
              <span className="mono">{formatTokenAmount(positions.haivelo.collateral)}</span>
            </div>
          </div>
        </div>
      )}

      {/* haiAERO */}
      {positions.haiaero && (
        <div className="position-card">
          <div className="position-card-header">
            <span>
              haiAERO Collateral
              <Tip text="haiAERO deposited as collateral. Same mechanism as haiVELO — rewards proportional to your collateral share. Earns HAI rewards from deposit-based funding." />
            </span>
            {positions.boosts?.haiaero && (
              <BoostBadge
                value={positions.boosts.haiaero}
                tip={`haiAERO boost = min(kite_share / collateral_share + 1, 2). Same formula as haiVELO boost.`}
              />
            )}
          </div>
          <div className="position-card-body">
            <div className="position-row">
              <span className="position-label" title="Your haiAERO collateral deposited in the protocol">Collateral</span>
              <span className="mono">{formatTokenAmount(positions.haiaero.collateral)}</span>
            </div>
          </div>
        </div>
      )}

      {/* LP Staking */}
      {positions.lpStaking && Object.keys(positions.lpStaking).length > 0 && (
        <div className="position-card">
          <div className="position-card-header">
            <span>
              LP Staking
              <Tip text="LP tokens staked in reward contracts. Each pool has a separate daily KITE reward allocation. Rewards proportional to your staked LP share." />
            </span>
          </div>
          <div className="position-card-body">
            {Object.entries(positions.lpStaking).map(([type, amount]) => (
              <div key={type} className="position-row">
                <span className="position-label" title={`Your staked LP tokens in the ${type} pool. Rewards from this pool's daily KITE allocation.`}>
                  {type}
                </span>
                <span className="mono">{formatTokenAmount(amount)}</span>
                {positions.boosts?.[`lpStaking_${type}`] && (
                  <BoostBadge
                    value={positions.boosts[`lpStaking_${type}`]}
                    tip={`LP Staking boost = min(kite_share / lp_stake_share + 1, 2). Staking KITE relative to your LP stake share boosts rewards.`}
                  />
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
            <span>
              Uniswap LP
              <Tip text="Uniswap V3 liquidity positions. Only full-range positions (ticks -887220 to 887220) count toward rewards. Weight = sum of liquidity." />
            </span>
            {positions.boosts?.lp && (
              <BoostBadge
                value={positions.boosts.lp}
                tip={`LP boost = min(kite_share / lp_liquidity_share + 1, 2).`}
              />
            )}
          </div>
          <div className="position-card-body">
            <div className="position-row">
              <span className="position-label" title="Total liquidity from your full-range Uniswap V3 positions">Liquidity</span>
              <span className="mono">{positions.lp.liquidity.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* No positions */}
      {!positions.minter &&
        !positions.haivelo &&
        !positions.haiaero &&
        !positions.lpStaking &&
        !positions.lp && <p className="dim">No positions</p>}
    </div>
  );
}
