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

export function stripLeadingIcon(s: string | undefined | null): string {
  if (!s) return '';
  return s.replace(/^[^A-Za-z0-9]+/, '').trim();
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

export function parseSheetDate(v: string | number | undefined | null): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v > 20000 && v < 90000) {
      return new Date(EXCEL_EPOCH_MS + v * 86400000);
    }
    return new Date(v);
  }
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n) && n > 20000 && n < 90000) {
      return new Date(EXCEL_EPOCH_MS + n * 86400000);
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function formatSheetDateShort(v: string | number | undefined | null): string {
  const d = parseSheetDate(v);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export type MarketTone = 'pos' | 'neg' | 'neutral';

export interface ComposedVerdict {
  label: string;
  short: string;
  tone: MarketTone;
  intense: boolean;
  coreKind: 'down' | 'stable' | 'up';
  totalKind: 'down' | 'stable' | 'up';
}

function classifyMove(d: number | null | undefined): { kind: 'down' | 'stable' | 'up'; tone: MarketTone } {
  if (d === null || d === undefined || !Number.isFinite(d)) return { kind: 'stable', tone: 'neutral' };
  if (d < -0.05) return { kind: 'down', tone: 'neg' };
  if (d > 0.05) return { kind: 'up', tone: 'pos' };
  return { kind: 'stable', tone: 'neutral' };
}

export function composeVerdict(weightedDelta: number, usersDelta: number): ComposedVerdict {
  const core = classifyMove(weightedDelta);
  const total = classifyMove(usersDelta);
  let tone: MarketTone = 'neutral';
  if (core.tone === 'neg' || total.tone === 'neg') tone = 'neg';
  else if (core.tone === 'pos' && total.tone === 'pos') tone = 'pos';
  else if (core.tone === 'pos' || total.tone === 'pos') tone = 'pos';
  const intense = core.kind === total.kind && core.kind !== 'stable';
  return {
    label: `Core market ${core.kind}, total ${total.kind}`,
    short: `Core ${core.kind} · total ${total.kind}`,
    tone,
    intense,
    coreKind: core.kind,
    totalKind: total.kind,
  };
}

export function verdictBadgeStyle(v: ComposedVerdict): { bg: string; text: string; bold: boolean } {
  if (v.tone === 'neg') {
    return v.intense
      ? { bg: 'bg-rose-700', text: 'text-white', bold: true }
      : { bg: 'bg-rose-100', text: 'text-rose-900', bold: false };
  }
  if (v.tone === 'pos') {
    return v.intense
      ? { bg: 'bg-emerald-700', text: 'text-white', bold: true }
      : { bg: 'bg-emerald-100', text: 'text-emerald-900', bold: false };
  }
  return { bg: 'bg-slate-100', text: 'text-slate-700', bold: false };
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

// ── Dates ─────────────────────────────────────────────────────────────────
//
// Every date shown to the reader goes through here, as '08 Sep 2026'.
//
// The month is spelled, not numbered, and that is the whole point: 08/09/2026
// still requires the reader to know whether the convention is dd/mm or mm/dd,
// and for the first twelve days of any month the two are indistinguishable —
// 03/09 could be March or September and nothing on screen resolves it. A spelled
// month cannot be misread by anyone, including someone who opens the dashboard
// expecting the American order.
//
// It also removes a dependency this app could not control: `<input type="date">`
// renders in the OS locale, and the picker popup still does. Naming the month
// means the two never contradict each other.
//
// ISO stays ISO in state, in sorting, and in export filenames — only the display
// is formatted. A display format leaking into a comparison would break both.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Month index (0-11) → 'Sep'. Exported so an input can parse what it prints. */
export const MONTH_ABBR = MONTHS;

/** Anything date-like → '08 Sep 2026'. */
export function formatDMY(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  // A 'YYYY-MM-DD' string is handled without Date so a date-only value is not
  // shifted by the viewer's timezone — the sheet means that calendar day.
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (m) {
      const mi = Number(m[2]) - 1;
      if (mi >= 0 && mi < 12) return `${m[3]} ${MONTHS[mi]} ${m[1]}`;
    }
  }
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** '08 Sep' — for axis ticks, where the year is already established. */
export function formatDM(v: string | number | Date | null | undefined): string {
  const full = formatDMY(v);
  if (full === '—') return full;
  const parts = full.split(' ');
  return parts.length === 3 ? `${parts[0]} ${parts[1]}` : full;
}

/** '08 Sep 2026 16:05' — for "read at" stamps. */
export function formatDMYTime(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${formatDMY(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** '01 Aug 2026 → 31 Aug 2026', collapsing to one date when they match. */
export function formatDMYRange(from?: string | null, to?: string | null): string {
  if (!from && !to) return '—';
  if (from && to && from === to) return formatDMY(from);
  return `${formatDMY(from)} → ${formatDMY(to)}`;
}
