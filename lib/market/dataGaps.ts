import type { SheetPayload } from '@/lib/sheets/types';

// Which per-day feeds are missing days, and which ones are behind the others.
//
// Every dated screen on this dashboard is assembled from five independent
// exports that land at different times and are refreshed by different jobs. When
// one of them is short, nothing breaks — the numbers simply describe a smaller
// period than the filter asked for, and a quiet stretch in the data is
// indistinguishable from a quiet stretch in the market. That has already cost
// one round of confusion (a 7-day filter reporting six days, because the Shopify
// export was one day behind Google Ads), so the condition is now stated instead
// of inferred.
//
// Two different faults, deliberately kept apart because they need different
// responses:
//
//   GAP  — a date missing INSIDE a feed's own range. The job didn't run that
//          day and the day will not appear on its own. Historical, permanent.
//   LAG  — a feed whose last day is older than the newest day any feed has. The
//          export just hasn't caught up; it fixes itself on the next refresh.
//
// Lag is measured against the newest day present ACROSS the feeds rather than
// against today's date on purpose. Every export trails real time by a day or
// two, so comparing to today would fire permanently and teach the reader to
// ignore the warning. Comparing feeds to each other only fires when they
// genuinely disagree, which is exactly when a window gets clipped.
//
// For the same reason lag has a floor. Measured live, three of the five feeds sit
// exactly one day behind the newest on an ordinary day — that is simply how this
// workbook looks, not a fault, and reporting it would put a warning on the screen
// every single day. A one-day spread that does clip a window is already called
// out where it actually bites, in red, on the paid-channel card. Here only a
// spread of two days or more is worth a footnote.
const LAG_FLOOR_DAYS = 2;

/** One per-day feed's coverage, and what it drives on screen. */
export interface FeedCoverage {
  /** The tab / export name, as the user knows it. */
  feed: string;
  /** What breaks or shrinks when this feed is short. */
  drives: string;
  from: string;
  to: string;
  /** Distinct days present. */
  days: number;
  /** Days missing between `from` and `to`, earliest first. */
  missing: string[];
  /** How many days behind the newest day across all feeds. 0 = up to date.
   *  Always the true figure; whether it is worth showing is `lagWorthNoting`. */
  lagDays: number;
  /** lagDays at or above LAG_FLOOR_DAYS — a spread bigger than this workbook's
   *  normal one-day skew between exports. */
  lagWorthNoting: boolean;
  /** Rows whose date cell could not be read at all. */
  unreadableRows: number;
  /** True when the feed has no usable rows — a different problem from a gap. */
  empty: boolean;
}

export interface DataGapReport {
  /** The newest day any feed covers — the reference lag is measured against. */
  newestDay: string;
  /** Every feed, in a stable order, whether or not it has a problem. */
  feeds: FeedCoverage[];
  /** Feeds with a gap, a lag, or nothing in them — what the UI shows. */
  problems: FeedCoverage[];
  /** Total distinct missing days across feeds (a day may be missing in several). */
  totalMissing: number;
}

const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);

/**
 * Dates arrive in two shapes and both are live in this workbook: parsed
 * 'YYYY-MM-DD' strings, and raw Excel serials that slipped through unconverted
 * (History and History_Daily_Country both carry them). Reading only one shape
 * would report a fully-populated tab as empty.
 */
function toIso(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 90000) {
    return iso(Date.UTC(1899, 11, 30) + v * 86400000);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '').trim());
  return m ? m[0] : null;
}

// Coverage is computed per feed in isolation; lag needs every feed's last day,
// so it is filled in afterwards.
type FeedSpan = Omit<FeedCoverage, 'lagDays' | 'lagWorthNoting'>;

function coverage(feed: string, drives: string, raw: unknown[]): FeedSpan {
  let unreadableRows = 0;
  const set = new Set<string>();
  for (const v of raw) {
    if (v === undefined || v === null || v === '') continue;
    const d = toIso(v);
    if (d) set.add(d);
    else unreadableRows++;
  }
  const days = Array.from(set).sort();
  if (days.length === 0) {
    return { feed, drives, from: '', to: '', days: 0, missing: [], unreadableRows, empty: true };
  }
  const from = days[0];
  const to = days[days.length - 1];
  const missing: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) {
    const k = iso(t);
    if (!set.has(k)) missing.push(k);
  }
  return { feed, drives, from, to, days: days.length, missing, unreadableRows, empty: false };
}

export function buildDataGapReport(data: SheetPayload | null | undefined): DataGapReport | null {
  if (!data) return null;

  const parts = [
    coverage(
      'History_Daily',
      'biểu đồ theo ngày, chế độ chọn ngày',
      (data.historyDaily ?? []).map((r) => r.snapshotDate),
    ),
    coverage(
      'History_Daily_Country',
      'tách theo nước ở chế độ chọn ngày',
      (data.historyDailyCountry ?? []).map((r) => r.snapshotDate),
    ),
    coverage('History', 'snapshot L7D theo keyword', (data.history ?? []).map((r) => r.snapshotDate)),
    coverage(
      'Shopify Ads (per-day)',
      'chi phí App Store Ads theo ngày · kênh trả phí · chi phí theo category',
      (data.shopifyDaily ?? []).map((r) => r.date),
    ),
    coverage(
      'Google Ads',
      'kênh trả phí',
      (data.googleAds?.campaigns ?? []).map((r) => r.date),
    ),
  ];

  const newestDay = parts.map((p) => p.to).filter(Boolean).sort().pop() ?? '';
  const feeds: FeedCoverage[] = parts.map((p) => {
    const lagDays =
      p.to && newestDay && p.to < newestDay
        ? Math.round((Date.parse(`${newestDay}T00:00:00Z`) - Date.parse(`${p.to}T00:00:00Z`)) / 86400000)
        : 0;
    return { ...p, lagDays, lagWorthNoting: lagDays >= LAG_FLOOR_DAYS };
  });

  const problems = feeds.filter(
    (f) => f.empty || f.missing.length > 0 || f.lagWorthNoting || f.unreadableRows > 0,
  );
  const allMissing = new Set<string>();
  feeds.forEach((f) => f.missing.forEach((d) => allMissing.add(d)));

  return { newestDay, feeds, problems, totalMissing: allMissing.size };
}
