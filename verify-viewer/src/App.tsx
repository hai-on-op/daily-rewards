import React, { useState, useEffect, useMemo } from 'react';
import { Report, UserRecord } from './types';
import { deriveData, DerivedData } from './utils/derive';
import ReportSelector from './components/ReportSelector';
import StatusBanner from './components/StatusBanner';
import SummaryCards from './components/SummaryCards';
import RunComparisonChart from './components/RunComparisonChart';
import PositionBreakdownChart from './components/PositionBreakdownChart';
import FilterBar from './components/FilterBar';
import UserTable from './components/UserTable';
import UserDetailModal from './components/UserDetailModal';

export default function App() {
  const [reports, setReports] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tokenFilter, setTokenFilter] = useState('');

  // Modal
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);

  // Load report list
  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((data: { files: string[] }) => data.files)
      .then((files: string[]) => {
        setReports(files);
        if (files.length > 0) setSelectedFile(files[0]);
      })
      .catch((e) => setError(`Failed to load reports: ${e.message}`));
  }, []);

  // Load selected report
  useEffect(() => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    fetch(`/api/report?file=${encodeURIComponent(selectedFile)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Report) => {
        setReport(data);
        setLoading(false);
        // Default to flagged view if there are flagged users
        const hasFlag = data.users.some((u) => !u.run1HasPosition || !u.run2HasPosition);
        setShowFlaggedOnly(hasFlag);
      })
      .catch((e) => {
        setError(`Failed to load report: ${e.message}`);
        setLoading(false);
      });
  }, [selectedFile]);

  const derived: DerivedData | null = useMemo(
    () => (report ? deriveData(report) : null),
    [report]
  );

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!derived) return [];
    let users = showFlaggedOnly ? derived.flaggedUsers : report!.users;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      users = users.filter((u) => u.address.toLowerCase().includes(q));
    }

    if (tokenFilter) {
      users = users.filter(
        (u) => u.run1Rewards[tokenFilter] !== undefined || u.run2Rewards[tokenFilter] !== undefined
      );
    }

    return users;
  }, [derived, report, showFlaggedOnly, searchQuery, tokenFilter]);

  if (error) {
    return (
      <div className="container">
        <div className="error-box">{error}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <h1>Position Verification Report</h1>
        <ReportSelector
          reports={reports}
          selected={selectedFile}
          onChange={setSelectedFile}
        />
      </header>

      {loading ? (
        <div className="loading">Loading report...</div>
      ) : report && derived ? (
        <>
          <StatusBanner report={report} derived={derived} />
          <SummaryCards report={report} derived={derived} />

          <div className="charts-row">
            <RunComparisonChart runs={report.runs} />
            <PositionBreakdownChart positionTypes={derived.positionTypeCounts} />
          </div>

          <FilterBar
            showFlaggedOnly={showFlaggedOnly}
            onToggleFlagged={setShowFlaggedOnly}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            tokenFilter={tokenFilter}
            onTokenFilterChange={setTokenFilter}
            tokens={derived.allTokens}
            flaggedCount={derived.flaggedUsers.length}
          />

          <UserTable
            users={filteredUsers}
            tokens={derived.allTokens}
            onSelectUser={setSelectedUser}
          />

          {selectedUser && (
            <UserDetailModal
              user={selectedUser}
              tokens={derived.allTokens}
              report={report}
              onClose={() => setSelectedUser(null)}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
