import React, { useMemo, useState } from 'react';

type TreeNode = {
  type: 'dir' | 'file';
  name: string;
  path: string;
  size?: number;
  children?: TreeNode[];
};

export const FileTree: React.FC<{
  node: TreeNode;
  selectedPath: string | null;
  onSelectFile: (p: string) => void;
}> = ({ node, onSelectFile, selectedPath }) => {
  const [openSet, setOpenSet] = useState<Record<string, boolean>>(() => ({ [node.path]: true }));

  const toggle = (p: string) => setOpenSet((s) => ({ ...s, [p]: !s[p] }));

  const TreeItem: React.FC<{ n: TreeNode }> = ({ n }) => {
    if (n.type === 'dir') {
      const isOpen = !!openSet[n.path];
      return (
        <li>
          <button onClick={() => toggle(n.path)} aria-label="toggle">
            {isOpen ? '📂' : '📁'} {n.name || '/'}
          </button>
          {isOpen && n.children && n.children.length ? (
            <ul>
              {n.children.map((c) => (
                <TreeItem key={c.path || c.name} n={c} />
              ))}
            </ul>
          ) : null}
        </li>
      );
    } else {
      const isSel = selectedPath === n.path;
      return (
        <li>
          <button className={isSel ? 'selected' : ''} onClick={() => onSelectFile(n.path)}>
            📄 {n.name}
          </button>
        </li>
      );
    }
  };

  return (
    <div className="tree">
      <ul>
        <TreeItem n={node} />
      </ul>
    </div>
  );
};


