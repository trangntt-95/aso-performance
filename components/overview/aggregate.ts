import type {
  ActionQueueRow,
  FunnelBreakdown,
  KeywordRow,
  MarketIndexSummaryRow,
  SheetPayload,
  Window,
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

function rowsForWindow(data: SheetPayload | undefined, window: OverviewWindow): KeywordRow[] {
  if (!data) return [];
  return data[KEYWORD_TAB_BY_WINDOW[window]] as KeywordRow[];
}

function countryRowsForWindow(data: SheetPayload | undefined, window: OverviewWindow): KeywordRow[] {
  if (!data) return [];
  return data[COUNTRY_TAB_BY_WINDOW[window]] as KeywordRow[];
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

export function computeKpis(data: SheetPayload | undefined, window: OverviewWindow): OverviewKpi {
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

  const market = data.marketIndex.summary.find((s) => s.window === (window as Window));
  const rows = rowsForWindow(data, window);
  const totalUsers = market ? market.basketUsersL : rows.reduce((s, r) => s + r.usersL, 0);
  const totalGetApp = market ? market.basketGetAppL : rows.reduce((s, r) => s + r.getAppL, 0);
  const alertCount = rows.filter((r) => r.alert && r.alert !== 'OK').length;

  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  data.actionQueue.forEach((r) => {
    if (r.priority in counts) counts[r.priority] += 1;
  });

  return {
    window,
    usersL: totalUsers,
    usersDeltaPct: market?.deltaUsersPct ?? 0,
    getAppL: totalGetApp,
    getAppDeltaPct: market?.deltaGetAppPct ?? 0,
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

export function channelSnapshotForWindow(
  data: SheetPayload | undefined,
  window: OverviewWindow,
): ChannelSnapshot | null {
  const funnel = data?.marketIndex.funnels.find((f) => f.window === (window as Window));
  if (!funnel) return null;
  const orgUsersL = funnel.organic.L.users;
  const orgUsersP = funnel.organic.P.users;
  const orgGetAppL = funnel.organic.L.getapp;
  const orgGetAppP = funnel.organic.P.getapp;
  const paidUsersL = funnel.paid.L.users;
  const paidUsersP = funnel.paid.P.users;
  const paidGetAppL = funnel.paid.L.getapp;
  const paidGetAppP = funnel.paid.P.getapp;
  return {
    organicUsers: orgUsersL,
    organicUsersPrior: orgUsersP,
    organicGetApp: orgGetAppL,
    organicGetAppPrior: orgGetAppP,
    organicCr: orgUsersL > 0 ? orgGetAppL / orgUsersL : 0,
    organicCrPrior: orgUsersP > 0 ? orgGetAppP / orgUsersP : 0,
    paidUsers: paidUsersL,
    paidUsersPrior: paidUsersP,
    paidGetApp: paidGetAppL,
    paidGetAppPrior: paidGetAppP,
    paidCr: paidUsersL > 0 ? paidGetAppL / paidUsersL : 0,
    paidCrPrior: paidUsersP > 0 ? paidGetAppP / paidUsersP : 0,
  };
}

export interface MarketTrajectoryPoint {
  window: string;
  usersDelta: number;
  getAppDelta: number;
  weightedDelta: number;
  verdict: string;
}

export function marketTrajectory(summary: MarketIndexSummaryRow[]): MarketTrajectoryPoint[] {
  const order = ['L3', 'L7', 'L14', 'L30', 'L90'];
  return [...summary]
    .filter((s) => order.includes(s.window))
    .sort((a, b) => order.indexOf(a.window) - order.indexOf(b.window))
    .map((s) => ({
      window: s.window,
      usersDelta: s.deltaUsersPct * 100,
      getAppDelta: s.deltaGetAppPct * 100,
      weightedDelta: s.deltaWeightedPct * 100,
      verdict: s.verdict,
    }));
}

export interface ChannelSplitPoint {
  window: string;
  organicUsers: number;
  paidUsers: number;
  organicGetApp: number;
  paidGetApp: number;
}

export function channelSplit(funnels: FunnelBreakdown[]): ChannelSplitPoint[] {
  const order = ['L3', 'L7', 'L14', 'L30', 'L90'];
  return [...funnels]
    .filter((f) => order.includes(f.window))
    .sort((a, b) => order.indexOf(a.window) - order.indexOf(b.window))
    .map((f) => ({
      window: f.window,
      organicUsers: f.organic.L.users,
      paidUsers: f.paid.L.users,
      organicGetApp: f.organic.L.getapp,
      paidGetApp: f.paid.L.getapp,
    }));
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
): CountryRollup[] {
  const rows = countryRowsForWindow(data, window);
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
): CategoryShare[] {
  const rows = rowsForWindow(data, window);
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
