import type { SheetPayload } from '@/lib/sheets/types';

// What is missing from the data a given screen was drawn from.
//
// Every dated screen here is assembled from several independent exports that land
// at different times and are refreshed by different jobs. When one is short,
// nothing breaks — the numbers simply describe a smaller period than the filter
// asked for, and a quiet stretch in the data is indistinguishable from a quiet
// stretch in the market. That has already cost one round of confusion (a 7-day
// filter reporting six days, because the Shopify export was a day behind Google
// Ads), so the condition is stated rather than left to be inferred.
//
// Three faults, kept apart because they need different responses:
//
//   GAP   — a date missing INSIDE a feed's own range. The job didn't run that
//           day and the day will not come back on its own. Permanent.
//   LAG   — a feed whose last day is older than the newest day any feed has.
//           The export hasn't caught up; it clears on the next refresh.
//   EMPTY — a tab with no readable rows at all. Not a missing day: the whole
//           source is absent, so whatever it feeds is running on a fallback or
//           not running at all.
//
// Lag is measured against the newest day present ACROSS the feeds, not against
// today. Every export trails real time by a day or two, so comparing to today
// would fire permanently and teach the reader to ignore the warning. Comparing
// feeds to each other only fires when they genuinely disagree — which is exactly
// when a window gets clipped.
//
// For the same reason lag has a floor. Measured live, three of the five dated
// feeds sit exactly one day behind the newest on an ordinary day; that is the
// normal shape of this workbook, not a fault. A one-day spread that does clip a
// window is already called out in red where it bites, on the paid-channel card.
const LAG_FLOOR_DAYS = 2;

// ── Which sources exist, and what each one feeds ───────────────────────────
//
// Every screen declares the sources it actually reads (see each page.tsx). That
// scoping is the point: reporting "History is missing 19 days" on Bid
// Recommendations — a screen built from 'Max bid cap', which carries no dates at
// all — is noise, and noise is how a warning stops being read. A page that
// forgets to declare a source simply says nothing about it, which is a silent
// omission rather than a false claim.

export type DataSourceKey =
  // Dated feeds — checked for gaps and lag.
  | 'historyDaily'
  | 'historyDailyCountry'
  | 'history'
  | 'shopifyDaily'
  | 'googleAds'
  // Undated tabs — only "is it there at all".
  | 'shopifyCamps'
  | 'bidCap'
  | 'perGeoCpiCap'
  | 'perGeoRevenue'
  | 'marketTiers'
  | 'masterKwLookup'
  | 'campLinks'
  | 'pausedKw'
  | 'marketIndex'
  | 'actionQueue'
  // Tab families — reports which members are empty.
  | 'allTabs'
  | 'countryTabs';

interface SourceDef {
  /** The tab / export name as the user knows it in the sheet. */
  label: string;
  /** What shrinks or falls back when this source is short. */
  drives: string;
  kind: 'dated' | 'tab' | 'tabset';
  /** Dated: the date cell of every row. Tab: the rows. Tabset: named members. */
  dates?: (d: SheetPayload) => unknown[];
  rows?: (d: SheetPayload) => unknown[];
  members?: (d: SheetPayload) => { name: string; rows: number }[];
}

const SOURCES: Record<DataSourceKey, SourceDef> = {
  historyDaily: {
    label: 'History_Daily',
    drives: 'biểu đồ theo ngày · chế độ chọn ngày',
    kind: 'dated',
    dates: (d) => (d.historyDaily ?? []).map((r) => r.snapshotDate),
  },
  historyDailyCountry: {
    label: 'History_Daily_Country',
    drives: 'tách theo nước ở chế độ chọn ngày',
    kind: 'dated',
    dates: (d) => (d.historyDailyCountry ?? []).map((r) => r.snapshotDate),
  },
  history: {
    label: 'History',
    drives: 'snapshot L7D theo keyword',
    kind: 'dated',
    dates: (d) => (d.history ?? []).map((r) => r.snapshotDate),
  },
  shopifyDaily: {
    label: 'Shopify Ads (per-day)',
    drives: 'chi phí App Store Ads theo ngày · kênh trả phí · camp health · chi phí theo category',
    kind: 'dated',
    dates: (d) => (d.shopifyDaily ?? []).map((r) => r.date),
  },
  googleAds: {
    label: 'Google Ads',
    drives: 'trang Google Ads · kênh trả phí',
    kind: 'dated',
    dates: (d) => (d.googleAds?.campaigns ?? []).map((r) => r.date),
  },

  shopifyCamps: {
    label: 'Shopify_daily',
    drives: 'tổng chi theo camp — overbid · chi phí theo category',
    kind: 'tab',
    rows: (d) => d.shopifyCamps ?? [],
  },
  bidCap: {
    label: 'Max bid cap',
    drives: 'bid đề xuất · mốc so cho overbid · trần CPI theo category',
    kind: 'tab',
    rows: (d) => d.bidCap ?? [],
  },
  perGeoCpiCap: {
    label: 'PerGeo_CPI_Cap',
    drives: 'trần CPI theo nước',
    kind: 'tab',
    rows: (d) => d.perGeoCpiCap ?? [],
  },
  perGeoRevenue: {
    label: 'PerGeo_CPI_Cap (block doanh thu)',
    drives: 'giá trị 1 install theo nước',
    kind: 'tab',
    rows: (d) => d.perGeoRevenue ?? [],
  },
  marketTiers: {
    label: 'PerGeo_CPI_Cap (block tier)',
    drives: 'tier của nước · trần bid theo tier',
    kind: 'tab',
    rows: (d) => d.marketTiers ?? [],
  },
  masterKwLookup: {
    label: 'Master KW Lookup',
    drives: 'keyword đang bid · category của camp',
    kind: 'tab',
    rows: (d) => d.masterKwLookup ?? [],
  },
  campLinks: {
    label: 'Camp_Links',
    drives: 'URL camp · Geo target · category của camp',
    kind: 'tab',
    rows: (d) => d.campLinks ?? [],
  },
  pausedKw: {
    label: 'Paused_camp',
    drives: 'nhận biết camp đã tắt — thiếu nó thì camp đã pause vẫn hiện như đang chạy',
    kind: 'tab',
    rows: (d) => d.pausedKw ?? [],
  },
  marketIndex: {
    label: 'Market_Index',
    drives: 'market health · dynamic basket',
    kind: 'tab',
    rows: (d) => d.marketIndex?.summary ?? [],
  },
  actionQueue: {
    label: 'Action_Queue',
    drives: 'việc cần làm',
    kind: 'tab',
    rows: (d) => d.actionQueue ?? [],
  },

  allTabs: {
    label: 'All_L* (theo keyword)',
    drives: 'nhu cầu theo keyword ở mọi window',
    kind: 'tabset',
    members: (d) => [
      { name: 'All_L3', rows: (d.allL3 ?? []).length },
      { name: 'All_L7', rows: (d.allL7 ?? []).length },
      { name: 'All_L14', rows: (d.allL14 ?? []).length },
      { name: 'All_L30', rows: (d.allL30 ?? []).length },
      { name: 'All_L90', rows: (d.allL90 ?? []).length },
      { name: 'All_L365', rows: (d.allL365 ?? []).length },
    ],
  },
  countryTabs: {
    label: 'Country_L* (theo nước)',
    drives: 'mọi khối tách theo nước',
    kind: 'tabset',
    members: (d) => [
      { name: 'Country_L3', rows: (d.countryL3 ?? []).length },
      { name: 'Country_L7', rows: (d.countryL7 ?? []).length },
      { name: 'Country_L14', rows: (d.countryL14 ?? []).length },
      { name: 'Country_L30', rows: (d.countryL30 ?? []).length },
      { name: 'Country_L90', rows: (d.countryL90 ?? []).length },
      { name: 'Country_L365', rows: (d.countryL365 ?? []).length },
    ],
  },
};

/** One source's state, and what it drives on screen. */
export interface SourceHealth {
  key: DataSourceKey;
  label: string;
  drives: string;
  kind: SourceDef['kind'];
  /** Dated sources only. */
  from: string;
  to: string;
  days: number;
  missing: string[];
  lagDays: number;
  lagWorthNoting: boolean;
  unreadableRows: number;
  /** True when the source has nothing readable in it. */
  empty: boolean;
  /** Tab families only: the members that are empty. */
  emptyMembers: string[];
}

export interface DataGapReport {
  /** The newest day any DATED source in scope covers — the lag reference. */
  newestDay: string;
  sources: SourceHealth[];
  /** Sources with a gap, a notable lag, missing members, or nothing in them. */
  problems: SourceHealth[];
}

const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);

/**
 * Dates arrive in two shapes and both are live in this workbook: parsed
 * 'YYYY-MM-DD' strings, and raw Excel serials that never got converted (History
 * and History_Daily_Country both carry them). Reading only one shape reports a
 * fully-populated tab as empty.
 */
function toIso(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 90000) {
    return iso(Date.UTC(1899, 11, 30) + v * 86400000);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '').trim());
  return m ? m[0] : null;
}

const blank = (key: DataSourceKey, def: SourceDef): SourceHealth => ({
  key,
  label: def.label,
  drives: def.drives,
  kind: def.kind,
  from: '',
  to: '',
  days: 0,
  missing: [],
  lagDays: 0,
  lagWorthNoting: false,
  unreadableRows: 0,
  empty: false,
  emptyMembers: [],
});

export function buildDataGapReport(
  data: SheetPayload | null | undefined,
  keys: readonly DataSourceKey[],
): DataGapReport | null {
  if (!data || keys.length === 0) return null;

  const sources: SourceHealth[] = keys.map((key) => {
    const def = SOURCES[key];
    const h = blank(key, def);

    if (def.kind === 'dated' && def.dates) {
      const set = new Set<string>();
      for (const v of def.dates(data)) {
        if (v === undefined || v === null || v === '') continue;
        const d = toIso(v);
        if (d) set.add(d);
        else h.unreadableRows++;
      }
      const days = Array.from(set).sort();
      if (days.length === 0) {
        h.empty = true;
        return h;
      }
      h.from = days[0];
      h.to = days[days.length - 1];
      h.days = days.length;
      for (let t = Date.parse(`${h.from}T00:00:00Z`); t <= Date.parse(`${h.to}T00:00:00Z`); t += 86400000) {
        const k = iso(t);
        if (!set.has(k)) h.missing.push(k);
      }
      return h;
    }

    if (def.kind === 'tab' && def.rows) {
      h.empty = def.rows(data).length === 0;
      return h;
    }

    if (def.kind === 'tabset' && def.members) {
      const members = def.members(data);
      h.emptyMembers = members.filter((m) => m.rows === 0).map((m) => m.name);
      // Every member empty is a different statement from one member empty: the
      // whole family is gone rather than a single window being unavailable.
      h.empty = members.length > 0 && h.emptyMembers.length === members.length;
      return h;
    }

    return h;
  });

  // Only dated sources in scope define "newest". A page that reads none has no
  // lag to report, and borrowing a date from a feed it never reads would invent
  // a comparison that means nothing on that screen.
  const newestDay =
    sources
      .filter((s) => s.kind === 'dated')
      .map((s) => s.to)
      .filter(Boolean)
      .sort()
      .pop() ?? '';

  for (const s of sources) {
    if (s.kind !== 'dated' || !s.to || !newestDay || s.to >= newestDay) continue;
    s.lagDays = Math.round((Date.parse(`${newestDay}T00:00:00Z`) - Date.parse(`${s.to}T00:00:00Z`)) / 86400000);
    s.lagWorthNoting = s.lagDays >= LAG_FLOOR_DAYS;
  }

  const problems = sources.filter(
    (s) =>
      s.empty ||
      s.missing.length > 0 ||
      s.lagWorthNoting ||
      s.unreadableRows > 0 ||
      s.emptyMembers.length > 0,
  );

  return { newestDay, sources, problems };
}
