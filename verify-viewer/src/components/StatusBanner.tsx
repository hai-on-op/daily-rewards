import React from 'react';
import { Report } from '../types';
import { DerivedData } from '../utils/derive';
import { formatDate } from '../utils/format';

interface Props {
  report: Report;
  derived: DerivedData;
}

export default function StatusBanner({ report, derived }: Props) {
  const flagged = derived.flaggedUsers.length;
  const total = report.users.length;
  const allClear = flagged === 0;

  return (
    <div className={`banner ${allClear ? 'ok' : 'warn'}`}>
      <div className="banner-main">
        <span className="banner-icon">{allClear ? '✓' : '⚠'}</span>
        <span className="banner-text">
          {allClear
            ? `All ${total} rewarded users have verified positions`
            : `${flagged} of ${total} users rewarded without active positions`}
        </span>
      </div>
      <div className="banner-meta">
        <span className="badge">{report.mode}</span>
        <span>{formatDate(report.generatedAt)}</span>
      </div>
    </div>
  );
}
