import type {
  ActionQueueRow,
  AlertType,
  BidAction,
  Category,
  HistoryDailyRow,
  KeywordRow,
  MarketIndexSummaryRow,
  SheetPayload,
  SurfaceLabel,
} from '@/lib/sheets/types';

export type OverviewWindow = 'L3' | 'L7' | 'L14' | 'L30' | 'L90';

export const OVERVIEW_WINDOWS: OverviewWindow[] = ['L3', 'L7', 'L14', 'L30', 'L90'];

const KEYWORD_TAB_BY_WINDOW: Record<OverviewWindow, keyof SheetPayload> = {
  L3: 'allL3',
  L7: 'allL7',
  L14: 'allL14',
  L30: 'allL30',
  L90: 'allL90',
};

const COUNTRY_TAB_BY_WINDOW: Record<OverviewWindow, keyof SheetPayload> = {
  L3: 'countryL3',
  L7: 'countryL7',
  L14: 'countryL14',
  L30: 'countryL30',
  L90: 'countryL90',
};

export function windowDays(w: OverviewWindow): number {
  return Number(w.slice(1));
}

export type SurfaceFocus = 'all' | 'organic' | 'paid';

export interface OverviewFilters {
  surface?: SurfaceFocus;
  country?: string | null;
  keyword?: string | null;
  category?: string | null;
}

function applyFilters(rows: KeywordRow[], opts: OverviewFilters): KeywordRow[] {
  let out = rows;
  const surface = opts.surface ?? 'all';
  if (surface !== 'all') {
    const target = surface === 'paid' ? 'search_ad' : 'search';
    out = out.filter((r) => r.surface === target);
  }
  if (opts.country) {
    out = out.filter((r) => r.country === opts.country);
  }
  if (opts.keyword) {
    const kw = opts.keyword.toLowerCase();
    out = out.filter((r) => r.searchTerm.toLowerCase() === kw);
  }
  if (opts.category) {
    out = out.filter((r) => r.category === opts.category);
  }
  return out;
}

function rowsForWindow(
  data: SheetPayload | undefined,
  window: OverviewWindow,
  opts: OverviewFilters = {},
): KeywordRow[] {
  if (!data) return [];
  // Country filter requires the Country_L tabs (which carry the country column).
  const tab = opts.country ? COUNTRY_TAB_BY_WINDOW[window] : KEYWORD_TAB_BY_WINDOW[window];
  return applyFilters(data[tab] as KeywordRow[], opts);
}

function countryRowsForWindow(
  data: SheetPayload | undefined,
  window: OverviewWindow,
  opts: OverviewFilters = {},
): KeywordRow[] {
  if (!data) return [];
  return applyFilters(data[COUNTRY_TAB_BY_WINDOW[window]] as KeywordRow[], opts);
}

export interface OverviewKpi {
  window: OverviewWindow;
  usersL: number;
  usersDeltaPct: number;
  getAppL: number;
  getAppDeltaPct: number;
  totalAlerts: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
}

function sumAllLx(rows: KeywordRow[]) {
  let usersL = 0;
  let usersP = 0;
  let getAppL = 0;
  let getAppP = 0;
  for (const r of rows) {
    usersL += r.usersL;
    usersP += r.usersP;
    getAppL += r.getAppL;
    getAppP += r.getAppP;
  }
  return { usersL, usersP, getAppL, getAppP };
}

function pctDelta(curr: number, prev: number): number {
  if (prev <= 0) return 0;
  return (curr - prev) / prev;
}

export function computeKpis(
  data: SheetPayload | undefined,
  window: OverviewWindow,
  opts: OverviewFilters = {},
): OverviewKpi {
  const fallback = {
    window,
    usersL: 0,
    usersDeltaPct: 0,
    getAppL: 0,
    getAppDeltaPct: 0,
    totalAlerts: 0,
    p0Count: 0,
    p1Count: 0,
    p2Count: 0,
    p3Count: 0,
  };
  if (!data) return fallback;

  const rows = rowsForWindow(data, window, opts);
  const totals = sumAllLx(rows);
  const alertCount = rows.filter((r) => r.alert && r.alert !== 'OK').length;

  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  data.actionQueue.forEach((r) => {
    if (r.priority in counts) counts[r.priority] += 1;
  });

  return {
    window,
    usersL: totals.usersL,
    usersDeltaPct: pctDelta(totals.usersL, totals.usersP),
    getAppL: totals.getAppL,
    getAppDeltaPct: pctDelta(totals.getAppL, totals.getAppP),
    totalAlerts: alertCount,
    p0Count: counts.P0,
    p1Count: counts.P1,
    p2Count: counts.P2,
    p3Count: counts.P3,
  };
}

export interface ChannelSnapshot {
  organicUsers: number;
  organicUsersPrior: number;
  organicGetApp: number;
  organicGetAppPrior: number;
  organicCr: number;
  organicCrPrior: number;
  paidUsers: number;
  paidUsersPrior: number;
  paidGetApp: number;
  paidGetAppPrior: number;
  paidCr: number;
  paidCrPrior: number;
}

function splitBySurface(rows: KeywordRow[]) {
  const org = { usersL: 0, usersP: 0, getAppL: 0, getAppP: 0 };
  const paid = { usersL: 0, usersP: 0, getAppL: 0, getAppP: 0 };
  for (const r of rows) {
    const bucket = r.surface === 'search_ad' ? paid : org;
    bucket.usersL += r.usersL;
    bucket.usersP += r.usersP;
    bucket.getAppL += r.getAppL;
    bucket.getAppP += r.getAppP;
  }
  return { org, paid };
}

export function channelSnapshotForWindow(
  data: SheetPayload | undefined,
  window: OverviewWindow,
  opts: OverviewFilters = {},
): ChannelSnapshot | null {
  if (!data) return null;
  // ChannelSnapshot needs both surfaces — strip the surface filter, keep country/keyword/category.
  const rows = rowsForWindow(data, window, {
    country: opts.country,
    keyword: opts.keyword,
    category: opts.category,
  });
  if (rows.length === 0) return null;
  const { org, paid } = splitBySurface(rows);
  return {
    organicUsers: org.usersL,
    organicUsersPrior: org.usersP,
    organicGetApp: org.getAppL,
    organicGetAppPrior: org.getAppP,
    organicCr: org.usersL > 0 ? org.getAppL / org.usersL : 0,
    organicCrPrior: org.usersP > 0 ? org.getAppP / org.usersP : 0,
    paidUsers: paid.usersL,
    paidUsersPrior: paid.usersP,
    paidGetApp: paid.getAppL,
    paidGetAppPrior: paid.getAppP,
    paidCr: paid.usersL > 0 ? paid.getAppL / paid.usersL : 0,
    paidCrPrior: paid.usersP > 0 ? paid.getAppP / paid.usersP : 0,
  };
}

export interface MarketTrajectoryPoint {
  window: string;
  usersDelta: number;
  getAppDelta: number;
  weightedDelta: number;
  verdict: string;
}

export function marketTrajectory(
  data: SheetPayload | undefined,
  opts: OverviewFilters = {},
): MarketTrajectoryPoint[] {
  if (!data) return [];
  const summaryByWindow = new Map<string, MarketIndexSummaryRow>();
  data.marketIndex.summary.forEach((s) => summaryByWindow.set(s.window, s));
  const unfiltered = !opts.surface || opts.surface === 'all';
  const noFocus = unfiltered && !opts.country && !opts.keyword;
  return OVERVIEW_WINDOWS.map((w) => {
    const totals = sumAllLx(rowsForWindow(data, w, opts));
    const usersDelta = pctDelta(totals.usersL, totals.usersP) * 100;
    const getAppDelta = pctDelta(totals.getAppL, totals.getAppP) * 100;
    const m = summaryByWindow.get(w);
    return {
      window: w,
      usersDelta,
      getAppDelta,
      weightedDelta: noFocus && m ? m.deltaWeightedPct * 100 : usersDelta,
      verdict: m?.verdict ?? '→ STABLE',
    };
  });
}

export interface ChannelSplitPoint {
  window: string;
  organicUsers: number;
  paidUsers: number;
  organicGetApp: number;
  paidGetApp: number;
}

export function channelSplit(data: SheetPayload | undefined): ChannelSplitPoint[] {
  if (!data) return [];
  return [...OVERVIEW_WINDOWS].reverse().map((w) => {
    const { org, paid } = splitBySurface(rowsForWindow(data, w));
    return {
      window: w,
      organicUsers: org.usersL,
      paidUsers: paid.usersL,
      organicGetApp: org.getAppL,
      paidGetApp: paid.getAppL,
    };
  });
}

export interface CountryRollup {
  country: string;
  users: number;
  getApp: number;
  cr: number;
  alertCount: number;
}

export function topCountriesFor(
  data: SheetPayload | undefined,
  window: OverviewWindow,
  limit = 8,
  opts: OverviewFilters = {},
): CountryRollup[] {
  // Country filter is intentionally dropped here: the chart needs all countries
  // to remain visible so the user can swap their focus.
  const rows = countryRowsForWindow(data, window, {
    surface: opts.surface,
    keyword: opts.keyword,
    category: opts.category,
  });
  const map = new Map<string, CountryRollup>();
  rows.forEach((r) => {
    if (!r.country) return;
    const cur = map.get(r.country) ?? { country: r.country, users: 0, getApp: 0, cr: 0, alertCount: 0 };
    cur.users += r.usersL;
    cur.getApp += r.getAppL;
    if (r.alert && r.alert !== 'OK') cur.alertCount += 1;
    map.set(r.country, cur);
  });
  return Array.from(map.values())
    .map((c) => ({ ...c, cr: c.users > 0 ? c.getApp / c.users : 0 }))
    .sort((a, b) => b.users - a.users)
    .slice(0, limit);
}

export interface CategoryShare {
  category: string;
  users: number;
  getApp: number;
  share: number;
  cr: number;
}

export function categoryShareFor(
  data: SheetPayload | undefined,
  window: OverviewWindow,
  opts: OverviewFilters = {},
): CategoryShare[] {
  // Drop the category filter here so the donut always shows every slice —
  // the user must be able to switch focus to another category.
  const rows = rowsForWindow(data, window, { ...opts, category: null });
  const map = new Map<string, CategoryShare>();
  let totalUsers = 0;
  rows.forEach((r) => {
    const cur = map.get(r.category) ?? { category: r.category, users: 0, getApp: 0, share: 0, cr: 0 };
    cur.users += r.usersL;
    cur.getApp += r.getAppL;
    totalUsers += r.usersL;
    map.set(r.category, cur);
  });
  return Array.from(map.values())
    .map((c) => ({ ...c, share: totalUsers > 0 ? c.users / totalUsers : 0, cr: c.users > 0 ? c.getApp / c.users : 0 }))
    .sort((a, b) => b.users - a.users);
}

export const EXCLUDED_COUNTRIES = new Set<string>(['Vietnam', 'India']);

export interface VolumeMover {
  keyword: string;
  country: string;
  surface: SurfaceLabel;
  category: Category;
  usersL: number;
  usersP: number;
  deltaUsersPct: number;
  getAppL: number;
  getAppP: number;
  deltaGetAppPct: number | null;
  crL: number | null;
  crP: number | null;
  deltaCrPct: number | null;
  posL: number | null;
  posP: number | null;
  deltaPosPct: number | null;
  alert: AlertType;
  bidAction?: BidAction;
  bidSuggest?: string;
  note?: string;
  direction: 'up' | 'down';
}

function mapSurface(s: string): SurfaceLabel {
  return s === 'search_ad' || s === 'paid' ? 'paid' : 'organic';
}

// Floor scales với window (~0.5 users/ngày, min 5) để không cắt sạch L7/L14 nơi tổng users nhỏ.
function defaultUsersFloor(window: OverviewWindow): number {
  return Math.max(5, Math.ceil(windowDays(window) * 0.5));
}

export function topVolumeMovers(
  data: SheetPayload | undefined,
  window: OverviewWindow,
  options: { limit?: number; minUsersFloor?: number } & OverviewFilters = {},
): VolumeMover[] {
  if (!data) return [];
  const {
    limit = 8,
    minUsersFloor = defaultUsersFloor(window),
    surface = 'all',
    country = null,
    keyword = null,
    category = null,
  } = options;

  const rows = countryRowsForWindow(data, window, { surface, country, keyword, category });

  const actionIndex = new Map<string, ActionQueueRow>();
  data.actionQueue.forEach((a) => {
    const key = `${a.keyword.toLowerCase()}|${a.country}|${a.surface}|${a.window}`;
    actionIndex.set(key, a);
  });

  const filtered = rows.filter((r) => {
    if (!Number.isFinite(r.deltaUsersPct)) return false;
    if (Math.max(r.usersL, r.usersP) < minUsersFloor) return false;
    if (r.country && EXCLUDED_COUNTRIES.has(r.country)) return false;
    return true;
  });

  filtered.sort((a, b) => Math.abs(b.deltaUsersPct) - Math.abs(a.deltaUsersPct));

  return filtered.slice(0, limit).map((r) => {
    const surface = mapSurface(r.surface);
    const country = r.country ?? '(global)';
    const key = `${r.searchTerm.toLowerCase()}|${country}|${surface}|${window}`;
    const action = actionIndex.get(key);
    const deltaGetAppPct = r.getAppP > 0 ? (r.getAppL - r.getAppP) / r.getAppP : null;
    return {
      keyword: r.searchTerm,
      country,
      surface,
      category: r.category,
      usersL: r.usersL,
      usersP: r.usersP,
      deltaUsersPct: r.deltaUsersPct,
      getAppL: r.getAppL,
      getAppP: r.getAppP,
      deltaGetAppPct,
      crL: r.crL,
      crP: r.crP,
      deltaCrPct: r.deltaCrPct,
      posL: r.posL,
      posP: r.posP,
      deltaPosPct: r.deltaPosPct,
      alert: r.alert,
      bidAction: action?.bidAction,
      bidSuggest: action?.bidSuggest,
      note: action?.note,
      direction: r.deltaUsersPct >= 0 ? 'up' : 'down',
    };
  });
}

export interface ContributorRow {
  keyword: string;
  category: Category;
  surface: SurfaceLabel;
  value: number;
  prior: number;
  deltaPct: number | null;
  sharePct: number;
}

export interface ContributorsResult {
  rows: ContributorRow[];
  total: number;
  fullCount: number;
}

export function topContributors(
  data: SheetPayload | undefined,
  window: OverviewWindow,
  metric: 'users' | 'getApp',
  limit = 8,
  opts: OverviewFilters = {},
): ContributorsResult {
  if (!data) return { rows: [], total: 0, fullCount: 0 };
  const rows = rowsForWindow(data, window, opts);
  const key: keyof KeywordRow = metric === 'users' ? 'usersL' : 'getAppL';
  const priorKey: keyof KeywordRow = metric === 'users' ? 'usersP' : 'getAppP';
  const total = rows.reduce((s, r) => s + (r[key] as number), 0);
  if (total <= 0) return { rows: [], total: 0, fullCount: rows.length };
  const ranked = [...rows]
    .sort((a, b) => (b[key] as number) - (a[key] as number))
    .slice(0, limit)
    .map((r) => {
      const value = r[key] as number;
      const prior = r[priorKey] as number;
      const deltaPct = prior > 0 ? (value - prior) / prior : null;
      return {
        keyword: r.searchTerm,
        category: r.category,
        surface: (r.surface === 'search_ad' ? 'paid' : 'organic') as SurfaceLabel,
        value,
        prior,
        deltaPct,
        sharePct: (value / total) * 100,
      };
    });
  return { rows: ranked, total, fullCount: rows.length };
}

// ---------------------------------------------------------------------------
// Daily trend (from History tab)
// History is per-day per-keyword usersL7D snapshots. Aggregate by date.
// ---------------------------------------------------------------------------

export interface DailyTrendPoint {
  date: string; // ISO yyyy-mm-dd
  dateLabel: string; // dd/mm for X-axis
  users: number;
  getApp: number | null; // null when History_Daily doesn't cover this date yet
  cr: number | null; // weighted CR = sum(getApp) / sum(users); null if either missing
}

function excelSerialToDate(serial: number): Date {
  // Excel epoch = 1899-12-30 (UTC). 25569 = days between that and 1970-01-01.
  return new Date((serial - 25569) * 86400 * 1000);
}

function dateKey(raw: string | number): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  // Convert ISO yyyy-mm-dd → serial-equivalent for sorting
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  if (!m) return null;
  const d = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d / 86400000 + 25569;
}

export function dailyTrend(
  data: SheetPayload | undefined,
  opts: OverviewFilters = {},
): DailyTrendPoint[] {
  if (!data) return [];
  const surface = opts.surface ?? 'all';
  const kw = opts.keyword?.toLowerCase();
  const target = surface === 'paid' ? 'search_ad' : surface === 'organic' ? 'search' : null;

  // Per-day aggregation. Prefer the Daily columns (true per-day metrics like
  // usersDaily / getAppDaily) when present. Fall back to the L7D rolling
  // columns from runDailySnapshot, then to the legacy History tab as a last
  // resort for users when nothing else covers the date.
  type Agg = {
    usersDaily: number;
    getAppDaily: number | null;
    usersDailyForCr: number;
    getAppDailyForCr: number;
    usersL7D: number;
    getAppL7D: number | null;
    usersL7DForCr: number;
    getAppL7DForCr: number;
    hasDaily: boolean;
    hasL7D: boolean;
  };
  const byDate = new Map<number, Agg>();
  const ensure = (k: number): Agg => {
    let a = byDate.get(k);
    if (!a) {
      a = {
        usersDaily: 0,
        getAppDaily: null,
        usersDailyForCr: 0,
        getAppDailyForCr: 0,
        usersL7D: 0,
        getAppL7D: null,
        usersL7DForCr: 0,
        getAppL7DForCr: 0,
        hasDaily: false,
        hasL7D: false,
      };
      byDate.set(k, a);
    }
    return a;
  };

  const dailyDates = new Set<number>();
  // dedupe overlapping backfill sources (l90 vs l30) to avoid double-counting.
  for (const r of dedupeDailyRows(data.historyDaily ?? [])) {
    if (target && r.surface !== target) continue;
    if (kw && r.searchTerm.toLowerCase() !== kw) continue;
    const k = dateKey(r.snapshotDate);
    if (k === null) continue;
    dailyDates.add(k);
    const a = ensure(k);

    if (r.usersDaily !== null) {
      a.usersDaily += r.usersDaily;
      a.hasDaily = true;
      if (r.getAppDaily !== null) {
        a.getAppDaily = (a.getAppDaily ?? 0) + r.getAppDaily;
        a.usersDailyForCr += r.usersDaily;
        a.getAppDailyForCr += r.getAppDaily;
      }
    }

    a.usersL7D += r.usersL7D;
    a.hasL7D = true;
    if (r.getAppL7D !== null) {
      a.getAppL7D = (a.getAppL7D ?? 0) + r.getAppL7D;
      a.usersL7DForCr += r.usersL7D;
      a.getAppL7DForCr += r.getAppL7D;
    }
  }

  for (const r of data.history) {
    if (target && r.surface !== target) continue;
    if (kw && r.searchTerm.toLowerCase() !== kw) continue;
    const k = dateKey(r.snapshotDate);
    if (k === null || dailyDates.has(k)) continue;
    const a = ensure(k);
    a.usersL7D += r.usersL7D;
    a.hasL7D = true;
  }

  // TRUSTED per-day install: rows fetched from GA4 by runDailyPerDaySnapshot /
  // backfillPerDay (source daily_perday / true_daily) carry REAL attributed
  // install per kw×surface — unlike the old backfill's getAppDaily (ad-clicks).
  // Rolling-7d over these reproduces getAppL7D (verified: matches within ~10%
  // on the 26/05→02/06 overlap), letting Install/CR extend before 20/05.
  const TRUSTED_PERDAY = new Set(['daily_perday', 'true_daily']);
  const trustedSeen = new Set<string>();
  const trustedByDate = new Map<number, { users: number; getApp: number }>();
  for (const r of data.historyDaily ?? []) {
    if (!TRUSTED_PERDAY.has(r.source)) continue;
    if (target && r.surface !== target) continue;
    if (kw && r.searchTerm.toLowerCase() !== kw) continue;
    const k = dateKey(r.snapshotDate);
    if (k === null) continue;
    const key = `${k}|${r.searchTerm.toLowerCase()}|${r.surface}`;
    if (trustedSeen.has(key)) continue; // daily_perday + true_daily dupes
    trustedSeen.add(key);
    let t = trustedByDate.get(k);
    if (!t) {
      t = { users: 0, getApp: 0 };
      trustedByDate.set(k, t);
    }
    t.users += r.usersDaily ?? 0;
    t.getApp += r.getAppDaily ?? 0;
  }
  const rollingTrusted = (serial: number): { users: number; getApp: number } | null => {
    let users = 0;
    let getApp = 0;
    let any = false;
    for (let s = serial - 6; s <= serial; s++) {
      const t = trustedByDate.get(s);
      if (t) {
        users += t.users;
        getApp += t.getApp;
        any = true;
      }
    }
    return any ? { users, getApp } : null;
  };

  // Synthetic rolling-7d Users for dates older than the L7D snapshots (~07/05).
  // usersDaily is real per-day users, so summing the trailing 7 calendar days
  // reproduces the same rolling-7d basis as usersL7D (no fake ~7× spike) and
  // extends the line back to the per-day backfill start (~late Feb). Install/CR
  // are NOT synthesised: getAppDaily is GA4 paid ad-clicks, not attributed
  // installs, so they stay L7D-only (shorter history) to avoid wrong numbers.
  const usersDailyByDate = new Map<number, number>();
  Array.from(byDate.entries()).forEach(([serial, agg]) => {
    if (agg.hasDaily) usersDailyByDate.set(serial, agg.usersDaily);
  });
  const rolling7Users = (serial: number): number | null => {
    let sum = 0;
    let any = false;
    for (let k = serial - 6; k <= serial; k++) {
      const v = usersDailyByDate.get(k);
      if (v !== undefined) {
        sum += v;
        any = true;
      }
    }
    return any ? sum : null;
  };

  return Array.from(byDate.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([serial, agg]) => {
      const d = excelSerialToDate(serial);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      // Prefer the real L7D snapshot; fall back to synthetic rolling-7d for the
      // older backfill-only dates so L30/L90/L365 show full Users history.
      const users = agg.usersL7D > 0 ? agg.usersL7D : rolling7Users(serial) ?? 0;
      // Install/CR: real getAppL7D (exists from 20/05) first, else rolling-7d
      // from trusted per-day install (extends back as far as backfillPerDay ran).
      const trusted = agg.getAppL7D === null ? rollingTrusted(serial) : null;
      const getApp = agg.getAppL7D ?? (trusted ? trusted.getApp : null);
      const crNumer = agg.getAppL7DForCr;
      const crDenom = agg.usersL7DForCr;
      const cr =
        crDenom > 0
          ? crNumer / crDenom
          : trusted && trusted.users > 0
          ? trusted.getApp / trusted.users
          : null;
      return {
        date: `${yyyy}-${mm}-${dd}`,
        dateLabel: `${dd}/${mm}`,
        users,
        getApp,
        cr,
      };
    });
}

// ---------------------------------------------------------------------------
// Date mode — scope the page to a single calendar day (clicked in DailyTrendChart).
// Source is per-day History_Daily only (no country, no category columns), so:
//   - KPIs (Users / Install / CR), Top contribution + Category share are derivable.
//   - Channel mix / Market Performance / Top countries / Volume movers are NOT
//     (they need the rolling L-window or country dimensions) → hidden by the UI.
// Category is recovered by joining keyword → category from the L-window tabs.
// Per-keyword value mirrors dailyTrend: prefer the Daily columns, else L7D rolling.
// ---------------------------------------------------------------------------

/** keyword (lowercase) → category, recovered from the L-window tabs. */
export function keywordCategoryMap(data: SheetPayload | undefined): Map<string, Category> {
  const map = new Map<string, Category>();
  if (!data) return map;
  const tabs: KeywordRow[][] = [data.allL90, data.allL30, data.allL14, data.allL7, data.allL3];
  for (const tab of tabs) {
    for (const r of tab) {
      const k = r.searchTerm.toLowerCase();
      if (!map.has(k)) map.set(k, r.category);
    }
  }
  return map;
}

/** ISO yyyy-mm-dd for a History_Daily snapshot value, matching DailyTrendPoint.date. */
function isoFromSnapshot(raw: string | number): string | null {
  const k = dateKey(raw);
  if (k === null) return null;
  const d = excelSerialToDate(k);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface DailyKwRow {
  keyword: string;
  surface: string;
  users: number;
  getApp: number | null;
}

/**
 * History_Daily can hold MULTIPLE rows for the same (date, keyword, surface)
 * because the backfill sources overlap (l90_backfill 21/02→26/05 vs
 * l30_backfill 22/04→21/05). Summing them double-counts (e.g. May paid install
 * 390 instead of 97). Keep ONE row per (date|keyword|surface), preferring the
 * most complete (true per-day values, then install present).
 */
function dedupeDailyRows(rows: HistoryDailyRow[]): HistoryDailyRow[] {
  // Rows for the same (date, kw, surface) can be COMPLEMENTARY, not just
  // redundant: daily_perday/backfill rows carry the Daily columns while
  // l7_snapshot/(empty)/legacy_history rows carry the L7D columns. Picking one
  // "winner" row dropped the other side (e.g. Install L7D vanished on dates
  // where a per-day row exists). MERGE field-wise instead: first non-null wins
  // per column (so duplicate per-day sources like daily_perday vs true_daily
  // don't double-count), and usersL7D takes the max (0 = missing).
  // Source priority for the merge: GA4-fetched per-day rows (daily_perday /
  // true_daily) carry REAL attributed install, while the old l90/l30 backfill's
  // getAppDaily is paid ad-CLICKS. Sort trusted-first so first-non-null per
  // column prefers the real numbers when both exist for a (date, kw, surface).
  const rank = (r: HistoryDailyRow): number => {
    const s = r.source || '';
    if (s === 'daily_perday' || s === 'true_daily') return 0;
    if (s === 'l7_snapshot') return 1;
    if (s === 'l90_backfill' || s === 'l30_backfill') return 3;
    return 2;
  };
  const map = new Map<string, HistoryDailyRow>();
  for (const r of [...rows].sort((a, b) => rank(a) - rank(b))) {
    const iso = isoFromSnapshot(r.snapshotDate);
    if (iso === null) continue;
    const key = `${iso}|${r.searchTerm.toLowerCase()}|${r.surface}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...r });
      continue;
    }
    cur.usersDaily = cur.usersDaily ?? r.usersDaily;
    cur.getAppDaily = cur.getAppDaily ?? r.getAppDaily;
    cur.crDaily = cur.crDaily ?? r.crDaily;
    cur.posDaily = cur.posDaily ?? r.posDaily;
    cur.usersL7D = Math.max(cur.usersL7D, r.usersL7D);
    cur.getAppL7D = cur.getAppL7D ?? r.getAppL7D;
    cur.crL7D = cur.crL7D ?? r.crL7D;
    cur.posL7D = cur.posL7D ?? r.posL7D;
  }
  return Array.from(map.values());
}

function isoAddDays(iso: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + n * 86400000;
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysInRange(from: string, to: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(from);
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(to);
  if (!a || !b) return 1;
  const ams = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const bms = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.max(1, Math.floor((bms - ams) / 86400000) + 1); // inclusive
}

/**
 * Per-keyword History_Daily rows within [from, to] (inclusive ISO compare).
 * IMPORTANT — column choice depends on span:
 *   - single day (from === to): prefer the true per-day columns, else the L7D
 *     rolling snapshot (a one-day point sample is fine for either).
 *   - multi-day range: ONLY the true per-day columns (usersDaily/getAppDaily).
 *     Summing the rolling L7D columns across days would overcount ~7×, so rows
 *     that lack a per-day value are skipped.
 */
function dailyRowsInRange(
  data: SheetPayload | undefined,
  from: string,
  to: string,
  opts: OverviewFilters = {},
  catMap?: Map<string, Category>,
): DailyKwRow[] {
  if (!data) return [];
  const singleDay = from === to;
  const surface = opts.surface ?? 'all';
  const target = surface === 'paid' ? 'search_ad' : surface === 'organic' ? 'search' : null;
  const kw = opts.keyword?.toLowerCase();
  const out: DailyKwRow[] = [];
  // dedupe first so overlapping backfill sources don't double-count.
  for (const r of dedupeDailyRows(data.historyDaily ?? [])) {
    if (target && r.surface !== target) continue;
    if (kw && r.searchTerm.toLowerCase() !== kw) continue;
    if (opts.category && catMap && catMap.get(r.searchTerm.toLowerCase()) !== opts.category) continue;
    const iso = isoFromSnapshot(r.snapshotDate);
    if (iso === null || iso < from || iso > to) continue;
    let users: number;
    let getApp: number | null;
    if (r.usersDaily !== null) {
      users = r.usersDaily;
      getApp = r.getAppDaily;
    } else if (singleDay) {
      users = r.usersL7D;
      getApp = r.getAppL7D;
    } else {
      continue; // multi-day: skip rolling-only rows (can't sum L7D)
    }
    out.push({ keyword: r.searchTerm, surface: r.surface, users, getApp });
  }
  return out;
}

/** ISO dates (asc) with per-day data under the current surface/keyword filter. */
export function availableDailyDates(
  data: SheetPayload | undefined,
  opts: OverviewFilters = {},
): string[] {
  if (!data) return [];
  const surface = opts.surface ?? 'all';
  const target = surface === 'paid' ? 'search_ad' : surface === 'organic' ? 'search' : null;
  const kw = opts.keyword?.toLowerCase();
  const set = new Set<string>();
  for (const r of data.historyDaily ?? []) {
    if (target && r.surface !== target) continue;
    if (kw && r.searchTerm.toLowerCase() !== kw) continue;
    const iso = isoFromSnapshot(r.snapshotDate);
    if (iso) set.add(iso);
  }
  return Array.from(set).sort();
}

export interface DateKpi {
  from: string;
  to: string;
  usersL: number;
  usersDeltaPct: number | null; // vs prior equal-length period
  getAppL: number | null;
  getAppDeltaPct: number | null;
  cr: number | null;
}

function sumDailyRows(rows: DailyKwRow[]) {
  let users = 0;
  let getApp = 0;
  let crDenom = 0;
  let hasGetApp = false;
  for (const r of rows) {
    users += r.users;
    if (r.getApp !== null) {
      getApp += r.getApp;
      crDenom += r.users;
      hasGetApp = true;
    }
  }
  return { users, getApp: hasGetApp ? getApp : null, crDenom };
}

export function kpisForRange(
  data: SheetPayload | undefined,
  from: string,
  to: string,
  opts: OverviewFilters = {},
): DateKpi {
  const empty: DateKpi = {
    from,
    to,
    usersL: 0,
    usersDeltaPct: null,
    getAppL: null,
    getAppDeltaPct: null,
    cr: null,
  };
  if (!data) return empty;
  const catMap = opts.category ? keywordCategoryMap(data) : undefined;
  const cur = sumDailyRows(dailyRowsInRange(data, from, to, opts, catMap));
  // Prior = immediately-preceding equal-length period.
  const span = daysInRange(from, to);
  const prevTo = isoAddDays(from, -1);
  const prevFrom = isoAddDays(from, -span);
  const prev = sumDailyRows(dailyRowsInRange(data, prevFrom, prevTo, opts, catMap));
  const cr = cur.crDenom > 0 && cur.getApp !== null ? cur.getApp / cur.crDenom : null;
  return {
    from,
    to,
    usersL: cur.users,
    usersDeltaPct: prev.users > 0 ? (cur.users - prev.users) / prev.users : null,
    getAppL: cur.getApp,
    getAppDeltaPct:
      prev.getApp && prev.getApp > 0 && cur.getApp !== null
        ? (cur.getApp - prev.getApp) / prev.getApp
        : null,
    cr,
  };
}

export function topContributorsForRange(
  data: SheetPayload | undefined,
  from: string,
  to: string,
  metric: 'users' | 'getApp',
  limit = 50,
  opts: OverviewFilters = {},
): ContributorsResult {
  if (!data) return { rows: [], total: 0, fullCount: 0 };
  const catMap = keywordCategoryMap(data);
  const rows = dailyRowsInRange(data, from, to, opts, catMap);
  const byKw = new Map<string, { value: number; surface: SurfaceLabel; category: Category }>();
  for (const r of rows) {
    const v = metric === 'users' ? r.users : r.getApp ?? 0;
    const cur =
      byKw.get(r.keyword) ?? {
        value: 0,
        surface: (r.surface === 'search_ad' ? 'paid' : 'organic') as SurfaceLabel,
        category: (catMap.get(r.keyword.toLowerCase()) ?? 'Unknown') as Category,
      };
    cur.value += v;
    byKw.set(r.keyword, cur);
  }
  const all = Array.from(byKw.entries()).map(([keyword, v]) => ({ keyword, ...v }));
  const total = all.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return { rows: [], total: 0, fullCount: all.length };
  const ranked = all
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((r) => ({
      keyword: r.keyword,
      category: r.category,
      surface: r.surface,
      value: r.value,
      prior: 0,
      deltaPct: null as number | null,
      sharePct: (r.value / total) * 100,
    }));
  return { rows: ranked, total, fullCount: all.length };
}

export function categoryShareForRange(
  data: SheetPayload | undefined,
  from: string,
  to: string,
  opts: OverviewFilters = {},
): CategoryShare[] {
  if (!data) return [];
  const catMap = keywordCategoryMap(data);
  // Drop category filter so the donut keeps every slice (matches categoryShareFor).
  const rows = dailyRowsInRange(data, from, to, { ...opts, category: null }, catMap);
  const map = new Map<string, CategoryShare>();
  let totalUsers = 0;
  for (const r of rows) {
    const cat = (catMap.get(r.keyword.toLowerCase()) ?? 'Unknown') as string;
    const cur = map.get(cat) ?? { category: cat, users: 0, getApp: 0, share: 0, cr: 0 };
    cur.users += r.users;
    cur.getApp += r.getApp ?? 0;
    totalUsers += r.users;
    map.set(cat, cur);
  }
  return Array.from(map.values())
    .map((c) => ({
      ...c,
      share: totalUsers > 0 ? c.users / totalUsers : 0,
      cr: c.users > 0 ? c.getApp / c.users : 0,
    }))
    .sort((a, b) => b.users - a.users);
}

/**
 * Channel mix (organic vs paid) for a date range. History_Daily HAS a surface
 * column, so this CAN be date-scoped (unlike country/window-based charts).
 * Prior = preceding equal-length period.
 */
export function channelSnapshotForRange(
  data: SheetPayload | undefined,
  from: string,
  to: string,
  opts: OverviewFilters = {},
): ChannelSnapshot | null {
  if (!data) return null;
  // Need both surfaces → keep keyword/category, drop surface.
  const base: OverviewFilters = { keyword: opts.keyword, category: opts.category };
  const catMap = base.category ? keywordCategoryMap(data) : undefined;
  const span = daysInRange(from, to);
  const curRows = dailyRowsInRange(data, from, to, base, catMap);
  const prevRows = dailyRowsInRange(data, isoAddDays(from, -span), isoAddDays(from, -1), base, catMap);
  const split = (rows: DailyKwRow[]) => {
    const org = { users: 0, getApp: 0 };
    const paid = { users: 0, getApp: 0 };
    for (const r of rows) {
      const b = r.surface === 'search_ad' ? paid : org;
      b.users += r.users;
      b.getApp += r.getApp ?? 0;
    }
    return { org, paid };
  };
  const cur = split(curRows);
  const prev = split(prevRows);
  return {
    organicUsers: cur.org.users,
    organicUsersPrior: prev.org.users,
    organicGetApp: cur.org.getApp,
    organicGetAppPrior: prev.org.getApp,
    organicCr: cur.org.users > 0 ? cur.org.getApp / cur.org.users : 0,
    organicCrPrior: prev.org.users > 0 ? prev.org.getApp / prev.org.users : 0,
    paidUsers: cur.paid.users,
    paidUsersPrior: prev.paid.users,
    paidGetApp: cur.paid.getApp,
    paidGetAppPrior: prev.paid.getApp,
    paidCr: cur.paid.users > 0 ? cur.paid.getApp / cur.paid.users : 0,
    paidCrPrior: prev.paid.users > 0 ? prev.paid.getApp / prev.paid.users : 0,
  };
}

// ---------------------------------------------------------------------------
// Full (unsliced) accessors for export — every row the page has, all columns.
// ---------------------------------------------------------------------------

/** All keyword rows for the window after filters (global tab, or country tab if country set). */
export function exportKeywordRows(
  data: SheetPayload | undefined,
  window: OverviewWindow,
  opts: OverviewFilters = {},
): KeywordRow[] {
  return rowsForWindow(data, window, opts);
}

/** All keyword × country rows for the window after surface/keyword/category filters. */
export function exportCountryRows(
  data: SheetPayload | undefined,
  window: OverviewWindow,
  opts: OverviewFilters = {},
): KeywordRow[] {
  return countryRowsForWindow(data, window, opts);
}

export interface RangeKeywordRow {
  keyword: string;
  surface: SurfaceLabel;
  category: Category;
  users: number;
  install: number | null;
  cr: number | null;
}

/** Per-keyword totals over a date range (deduped), all keywords. */
export function keywordTableForRange(
  data: SheetPayload | undefined,
  from: string,
  to: string,
  opts: OverviewFilters = {},
): RangeKeywordRow[] {
  if (!data) return [];
  const catMap = keywordCategoryMap(data);
  const rows = dailyRowsInRange(data, from, to, opts, catMap);
  const m = new Map<
    string,
    { users: number; install: number; hasInstall: boolean; surface: SurfaceLabel; category: Category }
  >();
  for (const r of rows) {
    const cur =
      m.get(r.keyword) ?? {
        users: 0,
        install: 0,
        hasInstall: false,
        surface: (r.surface === 'search_ad' ? 'paid' : 'organic') as SurfaceLabel,
        category: (catMap.get(r.keyword.toLowerCase()) ?? 'Unknown') as Category,
      };
    cur.users += r.users;
    if (r.getApp !== null) {
      cur.install += r.getApp;
      cur.hasInstall = true;
    }
    m.set(r.keyword, cur);
  }
  return Array.from(m.entries())
    .map(([keyword, v]) => ({
      keyword,
      surface: v.surface,
      category: v.category,
      users: v.users,
      install: v.hasInstall ? v.install : null,
      cr: v.hasInstall && v.users > 0 ? v.install / v.users : null,
    }))
    .sort((a, b) => b.users - a.users);
}

export function topP0Actions(actions: ActionQueueRow[], limit = 50): ActionQueueRow[] {
  return [...actions]
    .filter((a) => a.priority === 'P0' || a.priority === 'P1')
    .filter((a) => !EXCLUDED_COUNTRIES.has(a.country))
    .sort((a, b) => {
      const pa = a.priority === 'P0' ? 0 : 1;
      const pb = b.priority === 'P0' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (b.score ?? 0) - (a.score ?? 0);
    })
    .slice(0, limit);
}
