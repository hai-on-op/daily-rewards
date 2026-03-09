import React from 'react';

interface Props {
  showFlaggedOnly: boolean;
  onToggleFlagged: (v: boolean) => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  tokenFilter: string;
  onTokenFilterChange: (v: string) => void;
  tokens: string[];
  flaggedCount: number;
}

export default function FilterBar({
  showFlaggedOnly,
  onToggleFlagged,
  searchQuery,
  onSearchChange,
  tokenFilter,
  onTokenFilterChange,
  tokens,
  flaggedCount,
}: Props) {
  return (
    <div className="filter-bar">
      <div className="filter-toggles">
        <button
          className={`toggle-btn ${!showFlaggedOnly ? 'active' : ''}`}
          onClick={() => onToggleFlagged(false)}
        >
          All Users
        </button>
        <button
          className={`toggle-btn ${showFlaggedOnly ? 'active' : ''}`}
          onClick={() => onToggleFlagged(true)}
        >
          Flagged Only ({flaggedCount})
        </button>
      </div>

      <input
        type="text"
        className="search-input"
        placeholder="Search by address..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <select
        className="token-select"
        value={tokenFilter}
        onChange={(e) => onTokenFilterChange(e.target.value)}
      >
        <option value="">All Tokens</option>
        {tokens.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
