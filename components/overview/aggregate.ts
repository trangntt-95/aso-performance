import type {
  ActionQueueRow,
  AlertType,
  BidAction,
  Category,
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
  // ChannelSnapshot needs both surfaces — strip the surface filter, keep country/keyword.
  const rows = rowsForWindow(data, window, { country: opts.country, keyword: opts.keyword });
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
  const rows = countryRowsForWindow(data, window, { surface: opts.surface, keyword: opts.keyword });
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
}

export function categoryShareFor(
  data: SheetPayload | undefined,
  window: OverviewWindow,
  opts: OverviewFilters = {},
): CategoryShare[] {
  const rows = rowsForWindow(data, window, opts);
  const map = new Map<string, CategoryShare>();
  let totalUsers = 0;
  rows.forEach((r) => {
    const cur = map.get(r.category) ?? { category: r.category, users: 0, getApp: 0, share: 0 };
    cur.users += r.usersL;
    cur.getApp += r.getAppL;
    totalUsers += r.usersL;
    map.set(r.category, cur);
  });
  return Array.from(map.values())
    .map((c) => ({ ...c, share: totalUsers > 0 ? c.users / totalUsers : 0 }))
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
  } = options;

  const rows = countryRowsForWindow(data, window, { surface, country, keyword });

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
  const total = rows.reduce((s, r) => s + (r[key] as number), 0);
  if (total <= 0) return { rows: [], total: 0, fullCount: rows.length };
  const ranked = [...rows]
    .sort((a, b) => (b[key] as number) - (a[key] as number))
    .slice(0, limit)
    .map((r) => ({
      keyword: r.searchTerm,
      category: r.category,
      surface: (r.surface === 'search_ad' ? 'paid' : 'organic') as SurfaceLabel,
      value: r[key] as number,
      sharePct: ((r[key] as number) / total) * 100,
    }));
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
  for (const r of data.historyDaily ?? []) {
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

  return Array.from(byDate.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([serial, agg]) => {
      const d = excelSerialToDate(serial);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const users = agg.hasDaily ? agg.usersDaily : agg.usersL7D;
      const getApp = agg.hasDaily ? agg.getAppDaily : agg.getAppL7D;
      const crNumer = agg.hasDaily ? agg.getAppDailyForCr : agg.getAppL7DForCr;
      const crDenom = agg.hasDaily ? agg.usersDailyForCr : agg.usersL7DForCr;
      const cr = crDenom > 0 ? crNumer / crDenom : null;
      return {
        date: `${yyyy}-${mm}-${dd}`,
        dateLabel: `${dd}/${mm}`,
        users,
        getApp,
        cr,
      };
    });
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
