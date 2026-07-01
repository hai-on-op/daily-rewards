import { useState, useEffect } from 'react';
import { DailyRewardReport } from '../types';
import RewardDiffBreakdown from './comparison/RewardDiffBreakdown';
import ProtocolHealthComparison from './comparison/ProtocolHealthComparison';
import UserGrowthComparison from './comparison/UserGrowthComparison';
import StrategyShiftComparison from './comparison/StrategyShiftComparison';
import DailyTrendOverlay from './comparison/DailyTrendOverlay';
import TopMoversTable from './comparison/TopMoversTable';
import UserComparisonSearch from './comparison/UserComparisonSearch';

interface Props {
  reports: string[];
}

export default function CompareView({ reports }: Props) {
  const [fileA, setFileA] = useState(reports.length > 1 ? reports[1] : reports[0] || '');
  const [fileB, setFileB] = useState(reports[0] || '');

  const [reportA, setReportA] = useState<DailyRewardReport | null>(null);
  const [reportB, setReportB] = useState<DailyRewardReport | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);

  useEffect(() => {
    if (!fileA) return;
    setLoadingA(true);
    setErrorA(null);
    fetch(`/api/report?file=${encodeURIComponent(fileA)}`)
      .then((r) => r.json())
      .then((data: DailyRewardReport) => { setReportA(data); setLoadingA(false); })
      .catch((err) => { setErrorA(err.message); setLoadingA(false); });
  }, [fileA]);

  useEffect(() => {
    if (!fileB) return;
    setLoadingB(true);
    setErrorB(null);
    fetch(`/api/report?file=${encodeURIComponent(fileB)}`)
      .then((r) => r.json())
      .then((data: DailyRewardReport) => { setReportB(data); setLoadingB(false); })
      .catch((err) => { setErrorB(err.message); setLoadingB(false); });
  }, [fileB]);

  const formatLabel = (f: string) => f.replace('daily-reward-report-', '').replace('.json', '');
  const loading = loadingA || loadingB;

  return (
    <div>
      <div className="compare-selectors">
        <div className="compare-selector">
          <label>Report A (older)</label>
          <select className="report-select" value={fileA} onChange={(e) => setFileA(e.target.value)}>
            {reports.map((f) => (
              <option key={f} value={f}>{formatLabel(f)}</option>
            ))}
          </select>
        </div>
        <div className="compare-selector">
          <label>Report B (newer)</label>
          <select className="report-select" value={fileB} onChange={(e) => setFileB(e.target.value)}>
            {reports.map((f) => (
              <option key={f} value={f}>{formatLabel(f)}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <div className="loading">Loading reports...</div>}
      {errorA && <div className="error-box">Report A: {errorA}</div>}
      {errorB && <div className="error-box">Report B: {errorB}</div>}

      {!loading && reportA && reportB && (
        <>
          {fileA === fileB && (
            <div className="warning-box" style={{ marginBottom: 20 }}>
              You are comparing the same report with itself. Select different reports to see meaningful changes.
            </div>
          )}

          <RewardDiffBreakdown reportA={reportA} reportB={reportB} />
          <ProtocolHealthComparison reportA={reportA} reportB={reportB} />
          <UserGrowthComparison reportA={reportA} reportB={reportB} />
          <StrategyShiftComparison reportA={reportA} reportB={reportB} />
          <DailyTrendOverlay reportA={reportA} reportB={reportB} />
          <TopMoversTable reportA={reportA} reportB={reportB} />
          <UserComparisonSearch reportA={reportA} reportB={reportB} />
        </>
      )}
    </div>
  );
}
