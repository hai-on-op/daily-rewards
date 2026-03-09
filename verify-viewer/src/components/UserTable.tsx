import React, { useState, useMemo } from 'react';
import { UserRecord } from '../types';
import { shortAddr, formatTokenAmount } from '../utils/format';
import { userRewardDelta } from '../utils/derive';

interface Props {
  users: UserRecord[];
  tokens: string[];
  onSelectUser: (user: UserRecord) => void;
}

type SortKey = 'address' | 'status' | string;
type SortDir = 'asc' | 'desc';

function getDelta(user: UserRecord): Record<string, number> {
  return userRewardDelta(user);
}

export default function UserTable({ users, tokens, onSelectUser }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    const arr = [...users];
    const dir = sortDir === 'asc' ? 1 : -1;

    arr.sort((a, b) => {
      if (sortKey === 'address') {
        return a.address.localeCompare(b.address) * dir;
      }
      if (sortKey === 'status') {
        const aDelta = getDelta(a);
        const bDelta = getDelta(b);
        const aFlagged = Object.values(aDelta).some((d) => d > 0) && !a.run1HasPosition && !a.run2HasPosition;
        const bFlagged = Object.values(bDelta).some((d) => d > 0) && !b.run1HasPosition && !b.run2HasPosition;
        return ((aFlagged ? 0 : 1) - (bFlagged ? 0 : 1)) * dir;
      }
      // Sort by token delta
      const aDelta = getDelta(a)[sortKey] || 0;
      const bDelta = getDelta(b)[sortKey] || 0;
      return (aDelta - bDelta) * dir;
    });

    return arr;
  }, [users, sortKey, sortDir]);

  const sortIcon = (key: string) => {
    if (sortKey !== key) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const positionSummary = (positions: Record<string, string>) => {
    const keys = Object.keys(positions);
    if (keys.length === 0) return <span className="dim">none</span>;
    return keys.join(', ');
  };

  return (
    <div className="table-wrapper">
      <table className="user-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('status')}>Status{sortIcon('status')}</th>
            <th onClick={() => handleSort('address')}>Address{sortIcon('address')}</th>
            <th>Run 1 Positions</th>
            <th>Run 2 Positions</th>
            {tokens.map((t) => (
              <th key={t} onClick={() => handleSort(t)}>
                {t} (delta){sortIcon(t)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((user) => {
            const delta = getDelta(user);
            const hasPositiveDelta = Object.values(delta).some((d) => d > 0);
            const noPosition = !user.run1HasPosition && !user.run2HasPosition;
            const isFlagged = hasPositiveDelta && noPosition;
            return (
              <tr
                key={user.address}
                className={`user-row ${isFlagged ? 'flagged' : ''}`}
                onClick={() => onSelectUser(user)}
              >
                <td>
                  <span className={`status-dot ${isFlagged ? 'red' : 'green'}`} />
                </td>
                <td className="mono">{shortAddr(user.address)}</td>
                <td className="small">{positionSummary(user.run1Positions)}</td>
                <td className="small">{positionSummary(user.run2Positions)}</td>
                {tokens.map((t) => {
                  const d = delta[t] || 0;
                  if (d === 0) {
                    return (
                      <td key={t} className="mono right">
                        <span className="dim">-</span>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={t}
                      className={`mono right ${d > 0 ? 'positive' : 'negative'}`}
                    >
                      {d > 0 ? '+' : ''}
                      {formatTokenAmount(d)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && <div className="empty">No users match the current filters.</div>}
    </div>
  );
}
