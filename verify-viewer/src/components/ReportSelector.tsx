import React from 'react';

interface Props {
  reports: string[];
  selected: string;
  onChange: (file: string) => void;
}

export default function ReportSelector({ reports, selected, onChange }: Props) {
  if (reports.length === 0) return null;

  return (
    <select
      className="report-select"
      value={selected}
      onChange={(e) => onChange(e.target.value)}
    >
      {reports.map((f) => (
        <option key={f} value={f}>
          {f.replace('position-verification-', '').replace('.json', '')}
        </option>
      ))}
    </select>
  );
}
