import { useState, useMemo } from 'react';
import { DailyRewardReport, AggregatedUser } from '../../types';
import { shortAddr, formatTokenAmount, formatDelta, formatPctChange, formatPercent } from '../../utils/format';

interface Props {
  reportA: DailyRewardReport;
  reportB: DailyRewardReport;
}

interface UserRow {
  address: string;
  // avg daily
  dailyA: number;
  dailyB: number;
  dailyDiff: number;
  // cumulative over the period
  totalA: number;
  totalB: number;
  totalDiff: number;
  pctChange: number;
  shareA: number;
  shareB: number;
  daysA: number;
  daysB: number;
  onlyInA: boolean;
  onlyInB: boolean;
}

type SortKey = 'diff' | 'absDiff' | 'earnedA' | 'earnedB' | 'pctChange' | 'address';
type ViewMode = 'daily' | 'period';

export default function RewardDiffBreakdown({ reportA, reportB }: Props) {
  const [token, setToken] = useState('HAI');
  const [sortBy, setSortBy] = useState<SortKey>('absDiff');
  const [sortAsc, setSortAsc] = useState(false);
  const [showZero, setShowZero] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('period');

  const { rows, sumDailyA, sumDailyB, sumTotalA, sumTotalB } = useMemo(() => {
    const mapA = new Map<string, AggregatedUser>(
      reportA.users.map((u) => [u.address.toLowerCase(), u]),
    );
    const mapB = new Map<string, AggregatedUser>(
      reportB.users.map((u) => [u.address.toLowerCase(), u]),
    );
    const allAddrs = new Set([...mapA.keys(), ...mapB.keys()]);

    // sums for share calculation
    let sDailyA = 0, sDailyB = 0, sTotalA = 0, sTotalB = 0;
    const rawRows: { addr: string; uA: AggregatedUser | undefined; uB: AggregatedUser | undefined }[] = [];

    for (const addr of allAddrs) {
      const uA = mapA.get(addr);
      const uB = mapB.get(addr);
      const dA = uA?.avgDailyEarnedByToken[token] || 0;
      const dB = uB?.avgDailyEarnedByToken[token] || 0;
      const tA = dA * (uA?.daysActive || 0);
      const tB = dB * (uB?.daysActive || 0);
      sDailyA += dA;
      sDailyB += dB;
      sTotalA += tA;
      sTotalB += tB;
      rawRows.push({ addr, uA, uB });
    }

    const rows: UserRow[] = rawRows.map(({ addr, uA, uB }) => {
      const dA = uA?.avgDailyEarnedByToken[token] || 0;
      const dB = uB?.avgDailyEarnedByToken[token] || 0;
      const tA = dA * (uA?.daysActive || 0);
      const tB = dB * (uB?.daysActive || 0);
      const totalDiff = tB - tA;
      const pctChange = tA !== 0 ? totalDiff / Math.abs(tA) : tB !== 0 ? Infinity : 0;
      const shareA = sTotalA > 0 ? tA / sTotalA : 0;
      const shareB = sTotalB > 0 ? tB / sTotalB : 0;

      return {
        address: addr,
        dailyA: dA,
        dailyB: dB,
        dailyDiff: dB - dA,
        totalA: tA,
        totalB: tB,
        totalDiff,
        pctChange,
        shareA,
        shareB,
        daysA: uA?.daysActive || 0,
        daysB: uB?.daysActive || 0,
        onlyInA: !mapB.has(addr),
        onlyInB: !mapA.has(addr),
      };
    });

    return { rows, sumDailyA: sDailyA, sumDailyB: sDailyB, sumTotalA: sTotalA, sumTotalB: sTotalB };
  }, [reportA, reportB, token]);

  // pick which values to display based on viewMode
  const getEarnedA = (r: UserRow) => viewMode === 'period' ? r.totalA : r.dailyA;
  const getEarnedB = (r: UserRow) => viewMode === 'period' ? r.totalB : r.dailyB;
  const getDiff = (r: UserRow) => viewMode === 'period' ? r.totalDiff : r.dailyDiff;
  const displayTotalA = viewMode === 'period' ? sumTotalA : sumDailyA;
  const displayTotalB = viewMode === 'period' ? sumTotalB : sumDailyB;
  const displayTotalDiff = displayTotalB - displayTotalA;
  const displayTotalAbsDiff = useMemo(
    () => rows.reduce((s, r) => s + Math.abs(getDiff(r)), 0),
    [rows, viewMode],
  );

  const filtered = useMemo(() => {
    let list = showZero ? rows : rows.filter((r) => Math.abs(getDiff(r)) > 1e-10);
    list = [...list];
    list.sort((a, b) => {
      let va: number, vb: number;
      switch (sortBy) {
        case 'diff': va = getDiff(a); vb = getDiff(b); break;
        case 'absDiff': va = Math.abs(getDiff(a)); vb = Math.abs(getDiff(b)); break;
        case 'earnedA': va = getEarnedA(a); vb = getEarnedA(b); break;
        case 'earnedB': va = getEarnedB(a); vb = getEarnedB(b); break;
        case 'pctChange':
          va = isFinite(a.pctChange) ? a.pctChange : (a.pctChange > 0 ? 1e9 : -1e9);
          vb = isFinite(b.pctChange) ? b.pctChange : (b.pctChange > 0 ? 1e9 : -1e9);
          break;
        case 'address': return sortAsc ? a.address.localeCompare(b.address) : b.address.localeCompare(a.address);
        default: va = Math.abs(getDiff(a)); vb = Math.abs(getDiff(b));
      }
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [rows, sortBy, sortAsc, showZero, viewMode]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(false); }
  };

  const sortArrow = (key: SortKey) => sortBy === key ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';
  const diffClass = (d: number) => d > 1e-10 ? 'delta-positive' : d < -1e-10 ? 'delta-negative' : 'delta-neutral';

  const overDistributed = displayTotalDiff > 0.01;
  const underDistributed = displayTotalDiff < -0.01;
  const periodLabel = viewMode === 'period' ? 'Period Total' : 'Avg/Day';

  return (
    <div className="compare-section">
      <div className="section-title">Reward Diff Breakdown (Per User)</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div className="token-toggle">
          {['HAI', 'KITE'].map((t) => (
            <button
              key={t}
              className={`token-toggle-btn ${token === t ? 'active' : ''}`}
              onClick={() => setToken(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="token-toggle" style={{ marginLeft: 8 }}>
          <button
            className={`token-toggle-btn ${viewMode === 'daily' ? 'active' : ''}`}
            onClick={() => setViewMode('daily')}
          >
            Avg/Day
          </button>
          <button
            className={`token-toggle-btn ${viewMode === 'period' ? 'active' : ''}`}
            onClick={() => setViewMode('period')}
          >
            Period Total
          </button>
        </div>

        <label style={{ marginLeft: 8, fontSize: '0.78rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
          Show unchanged
        </label>
      </div>

      {/* Total absolute diff banner */}
      <div className="diff-banner">
        <div className="diff-banner-main">
          <span className="diff-banner-value">{formatTokenAmount(displayTotalAbsDiff)}</span>
          <span className="diff-banner-token">{token}</span>
        </div>
        <div className="diff-banner-label">
          total absolute difference across {filtered.length} users
          {viewMode === 'period' ? ' (cumulative over period)' : ' (per day)'}
        </div>
        {displayTotalA > 0 && (
          <div className="diff-banner-pct">
            {formatPctChange(displayTotalAbsDiff / displayTotalA)} of Report A total redistributed
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="cards-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className={`stat-value ${token === 'HAI' ? 'cyan' : 'green'}`}>{formatTokenAmount(displayTotalA)}</div>
          <div className="stat-label">{periodLabel} {token} (A)</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${token === 'HAI' ? 'cyan' : 'green'}`}>{formatTokenAmount(displayTotalB)}</div>
          <div className="stat-label">{periodLabel} {token} (B)</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${diffClass(displayTotalDiff)}`}>{formatDelta(displayTotalDiff)}</div>
          <div className="stat-label">Net Diff</div>
        </div>
        <div className="stat-card">
          <div className="stat-value amber">{formatTokenAmount(displayTotalAbsDiff)}</div>
          <div className="stat-label">Total |Diff| (redistribution)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{filtered.length}</div>
          <div className="stat-label">Users with Changes</div>
        </div>
      </div>

      {/* Impact callout */}
      {(overDistributed || underDistributed) && (
        <div className={overDistributed ? 'error-box' : 'warning-box'} style={{ marginBottom: 16, fontSize: '0.85rem' }}>
          <strong>
            {overDistributed
              ? `Report B distributes ${formatTokenAmount(displayTotalDiff)} MORE ${token} ${viewMode === 'period' ? 'over the period' : 'per day'} than Report A`
              : `Report B distributes ${formatTokenAmount(Math.abs(displayTotalDiff))} LESS ${token} ${viewMode === 'period' ? 'over the period' : 'per day'} than Report A`
            }
          </strong>
          <div style={{ marginTop: 4 }}>
            Total absolute redistribution across all users: <strong>{formatTokenAmount(displayTotalAbsDiff)} {token}</strong>.
            {displayTotalA > 0 && <> That is <strong>{formatPctChange(displayTotalAbsDiff / displayTotalA)}</strong> of Report A total.</>}
          </div>
        </div>
      )}

      {/* Full table */}
      <div className="table-wrapper" style={{ maxHeight: 600, overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('address')}>
                Address{sortArrow('address')}
              </th>
              {viewMode === 'period' && <th>Days A</th>}
              {viewMode === 'period' && <th>Days B</th>}
              <th onClick={() => handleSort('earnedA')} style={{ cursor: 'pointer' }}>
                {periodLabel} (A){sortArrow('earnedA')}
              </th>
              <th onClick={() => handleSort('earnedB')} style={{ cursor: 'pointer' }}>
                {periodLabel} (B){sortArrow('earnedB')}
              </th>
              <th onClick={() => handleSort('diff')} style={{ cursor: 'pointer' }}>
                Diff{sortArrow('diff')}
              </th>
              <th onClick={() => handleSort('pctChange')} style={{ cursor: 'pointer' }}>
                %{sortArrow('pctChange')}
              </th>
              <th onClick={() => handleSort('absDiff')} style={{ cursor: 'pointer' }}>
                |Diff|{sortArrow('absDiff')}
              </th>
              <th>Share (A)</th>
              <th>Share (B)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const eA = getEarnedA(r);
              const eB = getEarnedB(r);
              const d = getDiff(r);
              const pct = eA !== 0 ? d / Math.abs(eA) : eB !== 0 ? Infinity : 0;
              return (
                <tr key={r.address}>
                  <td style={{ textAlign: 'left' }}>
                    <span title={r.address}>{shortAddr(r.address)}</span>
                  </td>
                  {viewMode === 'period' && <td>{r.daysA}</td>}
                  {viewMode === 'period' && <td>{r.daysB}</td>}
                  <td>{formatTokenAmount(eA)}</td>
                  <td>{formatTokenAmount(eB)}</td>
                  <td className={diffClass(d)}>{formatDelta(d)}</td>
                  <td className={diffClass(d)}>
                    {isFinite(pct) ? formatPctChange(pct) : (r.onlyInB ? 'new' : 'gone')}
                  </td>
                  <td className="amber">{formatTokenAmount(Math.abs(d))}</td>
                  <td>{formatPercent(r.shareA)}</td>
                  <td>{formatPercent(r.shareB)}</td>
                  <td style={{ fontSize: '0.7rem' }}>
                    {r.onlyInB && <span className="delta-positive">NEW</span>}
                    {r.onlyInA && <span className="delta-negative">GONE</span>}
                    {!r.onlyInA && !r.onlyInB && Math.abs(d) > 1e-10 && (
                      <span className={diffClass(d)}>{d > 0 ? '\u2191' : '\u2193'}</span>
                    )}
                    {!r.onlyInA && !r.onlyInB && Math.abs(d) <= 1e-10 && (
                      <span className="delta-neutral">=</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="avg-row">
              <td style={{ textAlign: 'left' }}>TOTAL ({filtered.length} users)</td>
              {viewMode === 'period' && <td></td>}
              {viewMode === 'period' && <td></td>}
              <td>{formatTokenAmount(displayTotalA)}</td>
              <td>{formatTokenAmount(displayTotalB)}</td>
              <td className={diffClass(displayTotalDiff)}>{formatDelta(displayTotalDiff)}</td>
              <td className={diffClass(displayTotalDiff)}>
                {displayTotalA > 0 ? formatPctChange(displayTotalDiff / displayTotalA) : '-'}
              </td>
              <td className="amber">{formatTokenAmount(displayTotalAbsDiff)}</td>
              <td>100%</td>
              <td>100%</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
