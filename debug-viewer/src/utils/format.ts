/**
 * Human-readable formatting utilities for the debug viewer
 */

/** Format Unix timestamp to readable date string */
export function formatDate(ts: number): string {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** Format Unix timestamp to short date (no time) */
export function formatShortDate(ts: number): string {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format Unix timestamp to time only */
export function formatTime(ts: number): string {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/** Format duration in seconds to human readable */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Shorten an address: 0x1234...abcd */
export function shortAddr(address: string): string {
  if (!address || address.length < 10) return address || '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Format a number with commas and decimals */
export function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return '-';
  if (Math.abs(n) < 0.001 && n !== 0) return n.toExponential(2);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/** Format a token amount (larger numbers get fewer decimals) */
export function formatTokenAmount(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '-';
  if (n === 0) return '0';
  if (Math.abs(n) >= 1000) return formatNumber(n, 1);
  if (Math.abs(n) >= 1) return formatNumber(n, 3);
  if (Math.abs(n) >= 0.001) return formatNumber(n, 5);
  return n.toExponential(2);
}

/** Format a percentage */
export function formatPercent(n: number): string {
  if (isNaN(n)) return '-';
  return `${(n * 100).toFixed(1)}%`;
}
