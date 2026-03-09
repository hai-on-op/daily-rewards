import React from 'react';
import { Report } from '../types';
import { DerivedData } from '../utils/derive';
import { formatNumber } from '../utils/format';

interface Props {
  report: Report;
  derived: DerivedData;
}

export default function SummaryCards({ report, derived }: Props) {
  const totalUsers = report.users.length;
  const flagged = derived.flaggedUsers.length;

  const cards = [
    {
      label: 'Total Rewarded Users',
      value: totalUsers,
      alert: false,
    },
    {
      label: 'With Active Position',
      value: report.summary.run2.withPosition,
      alert: false,
    },
    {
      label: 'Earned Rewards + No Position',
      value: flagged,
      alert: flagged > 0,
    },
    {
      label: 'No New Rewards (safe)',
      value: totalUsers - flagged - report.summary.run2.withPosition,
      alert: false,
    },
  ];

  return (
    <div className="cards-grid">
      {cards.map((c) => (
        <div key={c.label} className={`stat-card ${c.alert ? 'alert' : ''}`}>
          <div className="stat-value">{formatNumber(c.value, 0)}</div>
          <div className="stat-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
