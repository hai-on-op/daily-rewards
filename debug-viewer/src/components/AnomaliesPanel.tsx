import React, { useMemo } from 'react';
import { anomalies } from '../utils/analytics';

export const AnomaliesPanel: React.FC<{ meta: any; events: any[] }> = ({ meta, events }) => {
  const issues = useMemo(() => anomalies(meta, events), [meta, events]);
  if (!issues.length) return (
    <div>
      <h3 style={{ marginTop: 0 }}>Anomalies</h3>
      <div>No issues detected.</div>
    </div>
  );
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Anomalies</h3>
      <ul>
        {issues.map((i, idx) => (
          <li key={idx}>
            <code>{i.type}</code> — {i.message} {i.ts ? `(ts=${i.ts})` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
};


