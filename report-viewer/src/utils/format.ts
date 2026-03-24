export function shortAddr(address: string): string {
  if (!address || address.length < 10) return address || '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return '-';
  if (Math.abs(n) < 0.001 && n !== 0) return n.toExponential(2);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function formatTokenAmount(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '-';
  if (n === 0) return '0';
  if (Math.abs(n) >= 1000) return formatNumber(n, 1);
  if (Math.abs(n) >= 1) return formatNumber(n, 3);
  if (Math.abs(n) >= 0.001) return formatNumber(n, 5);
  return n.toExponential(2);
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '-';
  const pct = n * 100;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  return `${pct.toExponential(1)}%`;
}

export function formatBoost(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '-';
  return `${n.toFixed(2)}x`;
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function strategyDisplayName(key: string): string {
  const map: Record<string, string> = {
    minter: 'Minter',
    haivelo: 'haiVELO',
    haiaero: 'haiAERO',
    lpStaking: 'LP Staking',
    'haiVELO': 'haiVELO',
    'haiVELO-historical': 'haiVELO (hist)',
    'haiAERO': 'haiAERO',
    LP: 'LP',
  };
  if (map[key]) return map[key];
  if (key.startsWith('lpStaking_')) return `LP Staking (${key.replace('lpStaking_', '').replace(/_/g, '/')})`;
  return key;
}
