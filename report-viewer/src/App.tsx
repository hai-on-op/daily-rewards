import { useState, useEffect, useMemo } from 'react';
import { DailyRewardReport, AggregatedUser, DayReport, DayUserEntry } from './types';
import AddressSearch from './components/AddressSearch';
import GlobalOverview from './components/GlobalOverview';
import HeroStats from './components/HeroStats';
import EarningsChart from './components/EarningsChart';
import StrategyBreakdown from './components/StrategyBreakdown';
import BoostSection from './components/BoostSection';
import DailyTable from './components/DailyTable';
import CompareView from './components/CompareView';

interface DailyDataEntry {
  date: string;
  dayReport: DayReport;
  userEntry: DayUserEntry;
}

export default function App() {
  const [viewMode, setViewMode] = useState<'single' | 'compare'>('single');
  const [reports, setReports] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [report, setReport] = useState<DailyRewardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Load report list
  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((data) => {
        setReports(data.files || []);
        if (data.files?.length > 0) setSelectedFile(data.files[0]);
        else setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  // Load selected report
  useEffect(() => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    fetch(`/api/report?file=${encodeURIComponent(selectedFile)}`)
      .then((r) => r.json())
      .then((data: DailyRewardReport) => {
        setReport(data);
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [selectedFile]);

  // Address search
  const handleSearch = (input: string) => {
    setSearchError(null);
    setResolvedAddress(null);

    if (!input) return;

    if (!/^0x[a-fA-F0-9]{40}$/.test(input)) {
      setSearchError('Invalid address format. Expected 0x followed by 40 hex characters.');
      return;
    }

    const addr = input.toLowerCase();
    const found = report?.users.find((u) => u.address.toLowerCase() === addr);
    if (!found) {
      setSearchError(`No rewards found for this address in the current report.`);
      return;
    }

    setResolvedAddress(addr);
  };

  // Derived user data
  const userAggregated: AggregatedUser | null = useMemo(() => {
    if (!report || !resolvedAddress) return null;
    return report.users.find((u) => u.address.toLowerCase() === resolvedAddress) || null;
  }, [report, resolvedAddress]);

  const userDailyData: DailyDataEntry[] = useMemo(() => {
    if (!report || !resolvedAddress) return [];
    return report.dailyReports
      .filter((day) => day.users[resolvedAddress])
      .map((day) => ({
        date: day.date,
        dayReport: day,
        userEntry: day.users[resolvedAddress],
      }));
  }, [report, resolvedAddress]);

  return (
    <div className="container">
      <header className="header">
        <h1>Daily Rewards Report</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="tab-bar">
            <button className={`tab-btn ${viewMode === 'single' ? 'active' : ''}`} onClick={() => setViewMode('single')}>Single</button>
            <button className={`tab-btn ${viewMode === 'compare' ? 'active' : ''}`} onClick={() => setViewMode('compare')}>Compare</button>
          </div>
          {viewMode === 'single' && reports.length > 0 && (
            <select
              className="report-select"
              value={selectedFile}
              onChange={(e) => { setSelectedFile(e.target.value); setResolvedAddress(null); setSearchError(null); }}
            >
              {reports.map((f) => (
                <option key={f} value={f}>{f.replace('daily-reward-report-', '').replace('.json', '')}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {viewMode === 'compare' ? (
        reports.length >= 2 ? (
          <CompareView reports={reports} />
        ) : (
          <div className="loading">Need at least 2 reports to compare.</div>
        )
      ) : (
        <>
          <AddressSearch onSearch={handleSearch} error={searchError} />

          {loading && <div className="loading">Loading report...</div>}
          {error && <div className="error-box">{error}</div>}

          {!loading && report && (
            <>
              <GlobalOverview report={report} />

              {searchError && !resolvedAddress && (
                <div className="warning-box">
                  <strong>Address not found</strong>
                  <div>This address has no reward history in the current report period.</div>
                </div>
              )}

              {resolvedAddress && userAggregated && (
                <div className="user-section">
                  <div className="section-title">
                    Rewards for <span className="mono">{resolvedAddress}</span>
                  </div>

                  <HeroStats user={userAggregated} />
                  <EarningsChart dailyData={userDailyData} />

                  <div className="charts-row">
                    <StrategyBreakdown user={userAggregated} />
                    <BoostSection user={userAggregated} />
                  </div>

                  <DailyTable dailyData={userDailyData} userAddress={resolvedAddress} />
                </div>
              )}
            </>
          )}

          {!loading && !report && !error && (
            <div className="loading">No report files found in the reports/ directory.</div>
          )}
        </>
      )}
    </div>
  );
}
