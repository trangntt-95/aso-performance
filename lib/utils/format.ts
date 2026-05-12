export function formatNumber(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (opts?.compact) {
    return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }
  return Intl.NumberFormat('en-US').format(n);
}

export function formatPercent(decimal: number | null | undefined, opts?: { signed?: boolean }): string {
  if (decimal === null || decimal === undefined || !Number.isFinite(decimal)) return '—';
  const pct = decimal * 100;
  const sign = opts?.signed && pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function formatDeltaPct(decimal: number | null | undefined): string {
  if (decimal === null || decimal === undefined || !Number.isFinite(decimal)) return '—';
  const pct = decimal * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function formatPos(pos: number | null | undefined): string {
  if (pos === null || pos === undefined || !Number.isFinite(pos)) return '—';
  return pos.toFixed(1);
}

export function deltaTone(decimal: number | null | undefined): 'pos' | 'neg' | 'neutral' {
  if (decimal === null || decimal === undefined || !Number.isFinite(decimal)) return 'neutral';
  if (decimal > 0.005) return 'pos';
  if (decimal < -0.005) return 'neg';
  return 'neutral';
}

export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
