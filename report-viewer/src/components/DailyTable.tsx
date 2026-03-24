import { useState, useMemo } from 'react';
import { DayReport, DayUserEntry, StrategyPositionData } from '../types';
import { formatTokenAmount, formatPercent, formatBoost, formatDateShort, strategyDisplayName } from '../utils/format';

interface DailyDataEntry {
  date: string;
  dayReport: DayReport;
  userEntry: DayUserEntry;
}

interface Props {
  dailyData: DailyDataEntry[];
  userAddress: string;
}

/** Aggregate strategy totals from dayReport (handles duplicate lpStaking entries) */
function aggregateStrategyTotals(day: DayReport): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const s of day.strategyTotals) {
    if (!map.has(s.strategy)) map.set(s.strategy, new Map());
    const tokens = map.get(s.strategy)!;
    tokens.set(s.token, (tokens.get(s.token) || 0) + s.totalReward);
  }
  return map;
}

/**
 * Calculate potential earnings at max boost (2.0x), accounting for the user's
 * increased boost also increasing the total boosted pool.
 *
 * Formula: max_share = 2s / (b(1-s) + 2s)
 * where s = current boosted share, b = current boost
 */
function calcMaxBoostPotential(
  pos: StrategyPositionData,
  poolTotal: number,
  currentEarned: number,
): { maxEarned: number; additionalEarned: number; pctIncrease: number } | null {
  if (pos.boost >= 2.0 || pos.weight <= 0 || poolTotal <= 0 || pos.totalWeight <= 0) return null;

  const currentShare = (pos.weight * pos.boost) / pos.totalWeight;
  const s = currentShare;
  const b = pos.boost;
  const maxShare = (2 * s) / (b * (1 - s) + 2 * s);
  const maxEarned = poolTotal * maxShare;
  const additionalEarned = maxEarned - currentEarned;
  const pctIncrease = currentEarned > 0 ? additionalEarned / currentEarned : 0;

  if (additionalEarned <= 0.0001) return null;

  return { maxEarned, additionalEarned, pctIncrease };
}

export default function DailyTable({ dailyData }: Props) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const copy = [...dailyData];
    copy.sort((a, b) => sortDir === 'asc'
      ? a.date.localeCompare(b.date)
      : b.date.localeCompare(a.date));
    return copy;
  }, [dailyData, sortDir]);

  // Discover all strategies across all days
  const allStrategies = useMemo(() => {
    const set = new Map<string, Set<string>>();
    for (const d of dailyData) {
      for (const [strat, tokens] of Object.entries(d.userEntry.dailyStrategyEarned)) {
        if (!set.has(strat)) set.set(strat, new Set());
        for (const t of Object.keys(tokens)) set.get(strat)!.add(t);
      }
      for (const s of d.dayReport.strategyTotals) {
        if (!set.has(s.strategy)) set.set(s.strategy, new Set());
        set.get(s.strategy)!.add(s.token);
      }
    }
    const result: { strategy: string; token: string }[] = [];
    for (const [strat, tokens] of set) {
      for (const token of tokens) result.push({ strategy: strat, token });
    }
    return result;
  }, [dailyData]);

  if (dailyData.length === 0) return null;

  return (
    <div>
      <div className="section-title">
        Daily Detail ({dailyData.length} days)
        <button
          className="sort-toggle"
          onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
        >
          {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>
      </div>

      <div className="day-cards">
        {sorted.map((d) => (
          <DayCard key={d.date} entry={d} allStrategies={allStrategies} />
        ))}
      </div>
    </div>
  );
}

function DayCard({ entry, allStrategies }: {
  entry: DailyDataEntry;
  allStrategies: { strategy: string; token: string }[];
}) {
  const { date, dayReport, userEntry } = entry;
  const poolTotals = aggregateStrategyTotals(dayReport);

  const userTokenTotals = Object.entries(userEntry.dailyEarned);
  const poolTokenTotals = Object.entries(dayReport.totalRewardByToken);
  const boostEntries = Object.entries(userEntry.boosts).filter(([, v]) => v > 0);

  return (
    <div className="day-card">
      {/* ── Header: date + user totals ── */}
      <div className="day-header">
        <div className="day-date">{formatDateShort(date)}</div>
        <div className="day-totals">
          {userTokenTotals.map(([token, amount]) => (
            <span key={token} className={`day-token ${token === 'HAI' ? 'cyan' : 'green'}`}>
              {formatTokenAmount(amount)} <small>{token}</small>
            </span>
          ))}
          {userTokenTotals.length === 0 && <span className="dim">No rewards</span>}
        </div>
      </div>

      {/* ── Narrative summary ── */}
      <DaySummary dayReport={dayReport} userEntry={userEntry} allStrategies={allStrategies} poolTotals={poolTotals} />

      {/* ── Token summary ── */}
      <div className="day-section">
        <table className="day-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Pool Total</th>
              <th>You Earned</th>
              <th>Your Share</th>
            </tr>
          </thead>
          <tbody>
            {poolTokenTotals.map(([token, poolTotal]) => {
              const userEarned = userEntry.dailyEarned[token] || 0;
              const share = poolTotal > 0 ? userEarned / poolTotal : 0;
              return (
                <tr key={token}>
                  <td className={token === 'HAI' ? 'cyan' : 'green'}><strong>{token}</strong></td>
                  <td className="mono">{formatTokenAmount(poolTotal)}</td>
                  <td className="mono"><strong>{formatTokenAmount(userEarned)}</strong></td>
                  <td className="mono">{formatPercent(share)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Strategy breakdown with real position weights ── */}
      <div className="day-section">
        <div className="day-section-label">Strategy Breakdown</div>
        {allStrategies.map(({ strategy, token }) => {
          const stratPoolTotal = poolTotals.get(strategy)?.get(token) || 0;
          const userEarned = userEntry.dailyStrategyEarned?.[strategy]?.[token] || 0;
          const pos: StrategyPositionData | undefined =
            userEntry.strategyPositions?.[strategy]?.[token];

          if (stratPoolTotal === 0 && userEarned === 0) return null;

          const maxBoost = pos && userEarned > 0
            ? calcMaxBoostPotential(pos, stratPoolTotal, userEarned)
            : null;

          const unboostedShare = pos && pos.totalUnboostedWeight > 0
            ? pos.weight / pos.totalUnboostedWeight : 0;
          const boostedShare = pos && pos.totalWeight > 0
            ? (pos.weight * pos.boost) / pos.totalWeight : 0;

          return (
            <div key={`${strategy}-${token}`} className={`strat-block ${userEarned > 0 ? '' : 'strat-inactive'}`}>
              <div className="strat-header">
                <span className="strat-name">{strategyDisplayName(strategy)}</span>
                <span className={`strat-token ${token === 'HAI' ? 'cyan' : 'green'}`}>{token}</span>
                <span className="strat-pool">Pool: <strong className="mono">{formatTokenAmount(stratPoolTotal)}</strong></span>
                <span className="strat-earned">
                  You: <strong className={`mono ${token === 'HAI' ? 'cyan' : 'green'}`}>
                    {userEarned > 0 ? formatTokenAmount(userEarned) : '-'}
                  </strong>
                </span>
                {pos && pos.boost > 1 ? (
                  <span className={`strat-boost ${pos.boost >= 1.5 ? 'boost-high' : pos.boost >= 1.2 ? 'boost-mid' : ''}`}>
                    {formatBoost(pos.boost)}
                  </span>
                ) : null}
              </div>

              {pos && userEarned > 0 && (
                <table className="day-table weights-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Total Weight</th>
                      <th>Your Weight</th>
                      <th>Your Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="row-label">Unboosted</td>
                      <td className="mono">{formatTokenAmount(pos.totalUnboostedWeight)}</td>
                      <td className="mono">{formatTokenAmount(pos.weight)}</td>
                      <td className="mono">{formatPercent(unboostedShare)}</td>
                    </tr>
                    <tr>
                      <td className="row-label">Boosted</td>
                      <td className="mono"><strong>{formatTokenAmount(pos.totalWeight)}</strong></td>
                      <td className="mono"><strong>{formatTokenAmount(pos.weight * pos.boost)}</strong></td>
                      <td className="mono"><strong>{formatPercent(boostedShare)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              )}

              {maxBoost && (
                <div className="max-boost-row">
                  <span className="max-boost-label">At max boost (2.0x):</span>
                  <span className="max-boost-extra">+{formatTokenAmount(maxBoost.additionalEarned)} {token}</span>
                  <span className="max-boost-pct">(+{(maxBoost.pctIncrease * 100).toFixed(0)}% more)</span>
                  <span className="dim" style={{ fontSize: '0.7rem' }}>
                    = {formatTokenAmount(maxBoost.maxEarned)} total
                  </span>
                </div>
              )}
              {pos && pos.boost >= 2 && userEarned > 0 && (
                <div className="max-boost-row">
                  <span className="boost-high" style={{ fontSize: '0.72rem' }}>Already at max boost</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer: boosts + kite ── */}
      <div className="day-footer">
        <div className="day-footer-group">
          <span className="day-footer-label">Boosts:</span>
          {boostEntries.length > 0 ? boostEntries.map(([key, val]) => (
            <span key={key} className={`day-boost-tag ${val >= 1.5 ? 'high' : val >= 1.2 ? 'mid' : ''}`}>
              {strategyDisplayName(key)} {formatBoost(val)}
            </span>
          )) : <span className="dim">none</span>}
        </div>
        <div className="day-footer-group">
          <span className="day-footer-label">KITE Staked:</span>
          <span className="mono">{formatTokenAmount(userEntry.kiteStaked)}</span>
          <span className="day-footer-label" style={{ marginLeft: 12 }}>Share:</span>
          <span className="mono">{formatPercent(userEntry.kiteShare)}</span>
        </div>
      </div>
    </div>
  );
}

/** Human-readable narrative that tells the day's reward story */
function DaySummary({ dayReport, userEntry, allStrategies, poolTotals }: {
  dayReport: DayReport;
  userEntry: DayUserEntry;
  allStrategies: { strategy: string; token: string }[];
  poolTotals: Map<string, Map<string, number>>;
}) {
  const lines: { text: string; value: string; cls?: string }[] = [];

  const earnedEntries = Object.entries(userEntry.dailyEarned).filter(([, v]) => v > 0);
  if (earnedEntries.length === 0) {
    return (
      <div className="day-narrative">
        <div className="narrative-line dim">No rewards earned this day.</div>
      </div>
    );
  }

  // Total earned
  const earnedStr = earnedEntries
    .map(([t, v]) => `${formatTokenAmount(v)} ${t}`)
    .join(' and ');
  lines.push({ text: 'You earned a total of', value: earnedStr, cls: 'highlight' });

  // Per-token pool share
  for (const [token, poolTotal] of Object.entries(dayReport.totalRewardByToken)) {
    const userEarned = userEntry.dailyEarned[token] || 0;
    if (userEarned <= 0 || poolTotal <= 0) continue;
    const share = userEarned / poolTotal;
    lines.push({
      text: `Out of ${formatTokenAmount(poolTotal)} ${token} distributed, you captured`,
      value: formatPercent(share),
    });
  }

  // Per-strategy breakdown with position context
  for (const { strategy, token } of allStrategies) {
    const userEarned = userEntry.dailyStrategyEarned?.[strategy]?.[token] || 0;
    if (userEarned <= 0) continue;

    const stratPool = poolTotals.get(strategy)?.get(token) || 0;
    const pos = userEntry.strategyPositions?.[strategy]?.[token];
    const name = strategyDisplayName(strategy);

    if (pos && pos.weight > 0) {
      const boostedWeight = pos.weight * pos.boost;
      lines.push({
        text: `In ${name}, your position of ${formatTokenAmount(pos.weight)} (${formatTokenAmount(boostedWeight)} after ${formatBoost(pos.boost)} boost) earned you`,
        value: `${formatTokenAmount(userEarned)} ${token}`,
        cls: token === 'HAI' ? 'cyan' : 'green',
      });
    } else {
      lines.push({
        text: `From ${name} you earned`,
        value: `${formatTokenAmount(userEarned)} ${token}`,
        cls: token === 'HAI' ? 'cyan' : 'green',
      });
    }

    // Max boost opportunity
    if (pos && pos.boost < 2 && pos.boost > 0 && stratPool > 0 && pos.totalWeight > 0) {
      const s = (pos.weight * pos.boost) / pos.totalWeight;
      const maxShare = (2 * s) / (pos.boost * (1 - s) + 2 * s);
      const maxEarned = stratPool * maxShare;
      const extra = maxEarned - userEarned;
      if (extra > 0.0001) {
        lines.push({
          text: `If you had max boost in ${name}, you would have earned an extra`,
          value: `+${formatTokenAmount(extra)} ${token}`,
          cls: 'green',
        });
      }
    }
  }

  // KITE staking context
  if (userEntry.kiteStaked > 0) {
    lines.push({
      text: `You had ${formatTokenAmount(userEntry.kiteStaked)} KITE staked, giving you`,
      value: `${formatPercent(userEntry.kiteShare)} of total KITE`,
    });
  } else if (earnedEntries.length > 0) {
    lines.push({
      text: 'You had no KITE staked — staking KITE would boost your rewards',
      value: '',
      cls: 'dim',
    });
  }

  return (
    <div className="day-narrative">
      {lines.map((line, i) => (
        <div key={i} className="narrative-line">
          <span className="narrative-text">{line.text}</span>
          {line.value && (
            <span className={`narrative-value ${line.cls || ''}`}>{line.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}
