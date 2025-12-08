import React, { useMemo, useState } from 'react';

function stringify(data: any) {
  try { return JSON.stringify(data, null, 2); } catch { return String(data); }
}

export const JSONViewer: React.FC<{ data: any }> = ({ data }) => {
  const [expanded, setExpanded] = useState(false);
  const txt = useMemo(() => stringify(expanded ? data : shorten(data)), [data, expanded]);

  return (
    <div>
      <div className="controls">
        <strong>Raw JSON</strong>
        <label>
          <input type="checkbox" checked={expanded} onChange={(e) => setExpanded(e.target.checked)} /> Expand
        </label>
      </div>
      <pre style={{ overflow: 'auto', maxHeight: 400 }}>
        {txt}
      </pre>
    </div>
  );
};

function shorten(data: any) {
  if (!data || typeof data !== 'object') return data;
  const copy: any = Array.isArray(data) ? [] : {};
  for (const k of Object.keys(data)) {
    const v: any = (data as any)[k];
    if (k === 'events' && Array.isArray(v) && v.length > 50) {
      copy[k] = v.slice(0, 50);
      continue;
    }
    copy[k] = v;
  }
  return copy;
}


