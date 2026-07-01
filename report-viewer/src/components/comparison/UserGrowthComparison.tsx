import { useState } from 'react';
import { DailyRewardReport } from '../../types';
import { compareUserSets } from '../../utils/compareReports';
import { shortAddr } from '../../utils/format';

interface Props {
  reportA: DailyRewardReport;
  reportB: DailyRewardReport;
}

export default function UserGrowthComparison({ reportA, reportB }: Props) {
  const { newUsers, departedUsers, commonUsers, countA, countB } = compareUserSets(reportA, reportB);
  const [showNew, setShowNew] = useState(false);
  const [showDeparted, setShowDeparted] = useState(false);

  return (
    <div className="compare-section">
      <div className="section-title">User Growth</div>
      <div className="cards-grid">
        <div className="stat-card">
          <div className="stat-value">{countA}</div>
          <div className="stat-label">Users in Report A</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{countB}</div>
          <div className="stat-label">Users in Report B</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{commonUsers.length}</div>
          <div className="stat-label">Common Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-value green">{newUsers.length}</div>
          <div className="stat-label">New Users (in B only)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--red)' }}>{departedUsers.length}</div>
          <div className="stat-label">Departed (in A only)</div>
        </div>
      </div>

      {newUsers.length > 0 && (
        <div className="chart-card" style={{ marginBottom: 12 }}>
          <button className="expandable-toggle" onClick={() => setShowNew(!showNew)}>
            {showNew ? 'Hide' : 'Show'} {newUsers.length} new user{newUsers.length !== 1 ? 's' : ''}
          </button>
          {showNew && (
            <div className="address-list">
              {newUsers.map((addr) => (
                <div key={addr} className="address-list-item">{shortAddr(addr)}<span className="dim"> {addr}</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      {departedUsers.length > 0 && (
        <div className="chart-card">
          <button className="expandable-toggle" onClick={() => setShowDeparted(!showDeparted)}>
            {showDeparted ? 'Hide' : 'Show'} {departedUsers.length} departed user{departedUsers.length !== 1 ? 's' : ''}
          </button>
          {showDeparted && (
            <div className="address-list">
              {departedUsers.map((addr) => (
                <div key={addr} className="address-list-item">{shortAddr(addr)}<span className="dim"> {addr}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
