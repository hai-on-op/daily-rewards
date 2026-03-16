import React from 'react';
import { Report } from '../types';
import { DerivedData } from '../utils/derive';
import { formatNumber, formatTokenAmount } from '../utils/format';

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
      value: formatNumber(totalUsers, 0),
      alert: false,
    },
    {
      label: 'With Active Position',
      value: formatNumber(report.summary.run2.withPosition, 0),
      alert: false,
    },
    {
      label: 'Earned Rewards + No Position',
      value: formatNumber(flagged, 0),
      alert: flagged > 0,
    },
    {
      label: 'KITE Staked (total)',
      value: derived.totalKiteStaked > 0 ? formatTokenAmount(derived.totalKiteStaked) : '-',
      alert: false,
    },
    {
      label: 'Users with Boost',
      value: formatNumber(derived.usersWithBoost, 0),
      alert: false,
    },
    {
      label: 'Avg Boost Multiplier',
      value: derived.avgBoost > 1 ? derived.avgBoost.toFixed(3) + 'x' : '-',
      alert: false,
    },
  ];

  return (
    <div className="cards-grid">
      {cards.map((c) => (
        <div key={c.label} className={`stat-card ${c.alert ? 'alert' : ''}`}>
          <div className="stat-value">{c.value}</div>
          <div className="stat-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
