import React, { useEffect, useMemo, useState } from 'react';
import { FileTree } from './components/FileTree';
import { JSONViewer } from './components/JSONViewer';
import { MetaPanel } from './components/MetaPanel';
import { EventsView } from './components/EventsView';
import { OverviewPanel } from './components/OverviewPanel';
import { TimelineScrubber } from './components/TimelineScrubber';
import { MechanicsChart } from './components/MechanicsChart';
import { AddressDrilldown } from './components/AddressDrilldown';
import { AnomaliesPanel } from './components/AnomaliesPanel';
import { HaiaeroStoryView, isHaiaeroData } from './components/HaiaeroStoryView';

type TreeNode = {
  type: 'dir' | 'file';
  name: string;
  path: string;
  size?: number;
  children?: TreeNode[];
};

export const App: React.FC = () => {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileData, setFileData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/list')
      .then(r => r.json())
      .then((d) => setTree(d.root))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!selectedPath) return;
    setError(null);
    setFileData(null);
    fetch(`/api/file?path=${encodeURIComponent(selectedPath)}`)
      .then(async (r) => {
        const txt = await r.text();
        try { return JSON.parse(txt); } catch { return txt; }
      })
      .then((d) => setFileData(d))
      .catch((e) => setError(String(e)));
  }, [selectedPath]);

  const meta = useMemo(() => (fileData && typeof fileData === 'object' ? fileData.meta : null), [fileData]);
  const events = useMemo(() => (fileData && typeof fileData === 'object' ? fileData.events : null), [fileData]);
  const showStoryView = useMemo(() => isHaiaeroData(fileData, selectedPath || ''), [fileData, selectedPath]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>Debug Data</h2>
        {tree ? (
          <FileTree node={tree} onSelectFile={setSelectedPath} selectedPath={selectedPath} />
        ) : error ? (
          <div className="error">{error}</div>
        ) : (
          <div>Loading...</div>
        )}
      </aside>
      <main className="content">
        {fileData ? (
          showStoryView ? (
            <HaiaeroStoryView data={fileData} filePath={selectedPath || ''} />
          ) : (
            <div className="panels">
              {meta && (
                <>
                  <section>
                    <OverviewPanel meta={meta} events={events || []} />
                  </section>
                  <section>
                    <TimelineScrubber events={events || []} />
                  </section>
                  <section>
                    <MechanicsChart events={events || []} />
                  </section>
                  <section>
                    <AddressDrilldown events={events || []} />
                  </section>
                  <section>
                    <AnomaliesPanel meta={meta} events={events || []} />
                  </section>
                  <section>
                    <MetaPanel meta={meta} />
                  </section>
                </>
              )}
              {events && Array.isArray(events) ? (
                <section>
                  <EventsView events={events} />
                </section>
              ) : null}
              <section>
                <JSONViewer data={fileData} />
              </section>
            </div>
          )
        ) : selectedPath ? (
          <div>Loading file...</div>
        ) : (
          <div className="welcome">
            <h2>Reward Debug Viewer</h2>
            <p>Select a file from the sidebar to explore reward distribution data.</p>
          </div>
        )}
      </main>
    </div>
  );
};
