import type { SheetPayload } from '@/lib/sheets/types';
import { isInstallAction } from '@/lib/market/googleAdsReport';
import { toUsd } from '@/lib/config/fx';
import { normKw } from '@/lib/sheets/kwNorm';

// Putting the two paid channels next to each other.
//
// They are not the same measurement and this file does not pretend otherwise:
//
//  - COST is comparable only after an assumed exchange rate (see lib/config/fx).
//  - CLICKS are directly comparable.
//  - INSTALLS are NOT the same number counted twice. The ASO side counts App
//    Store visits carrying a `surface_type=` parameter, which Google-driven
//    traffic never has; Google Ads counts installs it attributes to its own
//    clicks. Measured over the same 14 days: 52 vs 22. Largely disjoint, but
//    both ultimately read the same GA4 `shopify_app_install` event, so they are
//    reported side by side and never summed.
//
// Everything is computed over the window BOTH sources cover, otherwise the
// younger source (Google Ads started 2026-07-31) looks artificially small.

export interface ChannelStats {
  key: 'appstore' | 'google';
  label: string;
  /** Native currency of this channel's spend. */
  currency: string;
  spendNative: number;
  /** Spend converted to USD; null when the currency isn't convertible. */
  spendUsd: number | null;
  impressions: number;
  clicks: number;
  installs: number;
  cpc: number | null;
  /** Cost per install, in USD. Null when no installs or no conversion. */
  cpiUsd: number | null;
  /** What "install" means for this channel — shown next to the number. */
  installBasis: string;

  /** Same figures for the equal-length period immediately before. */
  prevSpendUsd: number | null;
  prevClicks: number;
  prevInstalls: number;
  prevCpiUsd: number | null;
  /** Relative change vs that period. null when the prior period held nothing —
   *  never 0, since "no baseline" and "flat" are different statements. */
  spendDelta: number | null;
  clicksDelta: number | null;
  installsDelta: number | null;
  cpiDelta: number | null;
}

export interface ChannelComparison {
  from: string;
  to: string;
  days: number;
  channels: ChannelStats[];
  /** True when the two sources don't overlap at all — nothing to compare. */
  noOverlap: boolean;
  /** The full range both channels cover, ignoring any page filter. Lets the UI
   *  say which days DO exist instead of just refusing to draw. */
  availableFrom: string;
  availableTo: string;
  /** True when a page-level date filter is what emptied the comparison. */
  clippedByFilter: boolean;
  /** The comparison period, or empty when there wasn't one. */
  prevFrom: string;
  prevTo: string;
  /** False when the prior period held no data on either channel. */
  hasPrev: boolean;

  // ── Why this window may be shorter than the one you picked ──────────────
  // The two channels are separate exports that land at different times, so a
  // 7-day filter routinely resolves to 6 days of comparable data. Reporting the
  // shortfall is what stops that reading as a real drop in the paid channels.
  /** Days the page filter asked for; null when no filter is active. */
  requestedDays: number | null;
  /** Dates inside the requested range that no comparison could cover, earliest
   *  first. Empty when the filter was honoured in full. */
  missingDays: string[];
  /** For each missing day, the channels that had no data on it. Lets the UI name
   *  the export that is behind instead of just saying a day is gone. */
  missingBecause: { date: string; channels: ('appstore' | 'google')[] }[];
}

export function compareChannels(
  data: SheetPayload | undefined,
  /** Page-level date filter. The comparison is clipped to it, then further
   *  clipped to the days both channels actually reported — asking for July
   *  cannot invent Google days that don't exist. */
  range?: { from: string; to: string } | null,
): ChannelComparison | null {
  if (!data) return null;
  const g = data.googleAds;
  const shopify = data.shopifyDaily ?? [];
  if (!g || g.campaigns.length === 0 || shopify.length === 0) return null;

  const gDates = Array.from(new Set(g.campaigns.map((c) => c.date))).sort();
  const sDates = Array.from(new Set(shopify.map((r) => r.date))).sort();
  // The overlap, so neither channel is credited with days the other never saw.
  const availableFrom = gDates[0] > sDates[0] ? gDates[0] : sDates[0];
  const availableTo =
    gDates[gDates.length - 1] < sDates[sDates.length - 1] ? gDates[gDates.length - 1] : sDates[sDates.length - 1];
  let from = availableFrom;
  let to = availableTo;
  if (range?.from && range.from > from) from = range.from;
  if (range?.to && range.to < to) to = range.to;
  if (from > to) {
    return {
      from,
      to,
      days: 0,
      channels: [],
      noOverlap: true,
      prevFrom: '',
      prevTo: '',
      hasPrev: false,
      availableFrom,
      availableTo,
      // Distinguish "the two exports share no days" from "you filtered to days
      // one of them doesn't have" — they need different words.
      clippedByFilter: availableFrom <= availableTo,
      requestedDays:
        range?.from && range?.to
          ? Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000) + 1
          : null,
      missingDays: [],
      missingBecause: [],
    };
  }
  const inRange = (d: string) => d >= from && d <= to;
  const days = new Set<string>();

  // The comparison period matches the days this one actually spans, not the days
  // the filter asked for. With one export lagging, an L7 window can cover 4 days;
  // measuring those against a 7-day baseline invents a drop.
  const shift = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  const prevTo = shift(from, -1);
  const prevFrom = shift(prevTo, -(span - 1));
  const inPrev = (d: string) => d >= prevFrom && d <= prevTo;
  const prevDays = new Set<string>();

  let psSpend = 0, psClicks = 0, psInstalls = 0;
  for (const r of shopify) {
    if (!inPrev(r.date)) continue;
    prevDays.add(r.date);
    psSpend += r.spend;
    psClicks += r.clicks;
    psInstalls += r.installs;
  }
  let pgSpend = 0, pgClicks = 0;
  for (const c of g.campaigns) {
    if (!inPrev(c.date)) continue;
    prevDays.add(c.date);
    pgSpend += c.cost;
    pgClicks += c.clicks;
  }
  let pgInstalls = 0;
  for (const a of g.convActions) {
    if (!inPrev(a.date)) continue;
    if (isInstallAction(a.actionName)) pgInstalls += a.conversions;
  }
  const hasPrev = prevDays.size > 0;
  /** Relative change, or null when there is no baseline to divide by. */
  const rel = (cur: number, prev: number): number | null =>
    hasPrev && prev > 0 ? (cur - prev) / prev : null;

  let sSpend = 0, sClicks = 0, sImp = 0, sInstalls = 0;
  for (const r of shopify) {
    if (!inRange(r.date)) continue;
    days.add(r.date);
    sSpend += r.spend;
    sClicks += r.clicks;
    sImp += r.impressions;
    sInstalls += r.installs;
  }

  let gSpend = 0, gClicks = 0, gImp = 0;
  for (const c of g.campaigns) {
    if (!inRange(c.date)) continue;
    days.add(c.date);
    gSpend += c.cost;
    gClicks += c.clicks;
    gImp += c.impressions;
  }
  // Installs only, never Google's blended conversion count.
  let gInstalls = 0;
  for (const a of g.convActions) {
    if (!inRange(a.date)) continue;
    if (isInstallAction(a.actionName)) gInstalls += a.conversions;
  }

  const gCur = g.meta?.currency || 'VND';
  const gUsd = toUsd(gSpend, gCur);

  const channels: ChannelStats[] = [
    {
      key: 'appstore',
      label: 'Shopify App Store Ads',
      currency: 'USD',
      spendNative: sSpend,
      spendUsd: sSpend,
      impressions: sImp,
      clicks: sClicks,
      installs: sInstalls,
      cpc: sClicks > 0 ? sSpend / sClicks : null,
      cpiUsd: sInstalls > 0 ? sSpend / sInstalls : null,
      installBasis: 'Install ghi nhận trong export Shopify Ads.',
      prevSpendUsd: hasPrev ? psSpend : null,
      prevClicks: psClicks,
      prevInstalls: psInstalls,
      prevCpiUsd: psInstalls > 0 ? psSpend / psInstalls : null,
      spendDelta: rel(sSpend, psSpend),
      clicksDelta: rel(sClicks, psClicks),
      installsDelta: rel(sInstalls, psInstalls),
      cpiDelta:
        hasPrev && psInstalls > 0 && sInstalls > 0
          ? sSpend / sInstalls / (psSpend / psInstalls) - 1
          : null,
    },
    {
      key: 'google',
      label: 'Google Ads',
      currency: gCur,
      spendNative: gSpend,
      spendUsd: gUsd,
      impressions: gImp,
      clicks: gClicks,
      installs: gInstalls,
      cpc: gClicks > 0 ? gSpend / gClicks : null,
      cpiUsd: gUsd !== null && gInstalls > 0 ? gUsd / gInstalls : null,
      installBasis: 'Chỉ hành động install (app_install / shopify_app_install), không phải tổng conversions.',
      prevSpendUsd: hasPrev ? toUsd(pgSpend, gCur) : null,
      prevClicks: pgClicks,
      prevInstalls: pgInstalls,
      prevCpiUsd: (() => {
        const u = toUsd(pgSpend, gCur);
        return u !== null && pgInstalls > 0 ? u / pgInstalls : null;
      })(),
      spendDelta: rel(gSpend, pgSpend),
      clicksDelta: rel(gClicks, pgClicks),
      installsDelta: rel(gInstalls, pgInstalls),
      cpiDelta: (() => {
        const cu = gUsd !== null && gInstalls > 0 ? gUsd / gInstalls : null;
        const pu = toUsd(pgSpend, gCur);
        const pc = pu !== null && pgInstalls > 0 ? pu / pgInstalls : null;
        return hasPrev && cu !== null && pc !== null && pc > 0 ? cu / pc - 1 : null;
      })(),
    },
  ];

  const dayList = Array.from(days).sort();

  // Which of the requested days ended up with nothing behind them, and which
  // export is responsible. Two separate causes are folded together here on
  // purpose, because the fix is the same either way — wait for the late sheet:
  //   * the day fell outside the two channels' overlap, and
  //   * the day is inside the overlap but one export simply has no rows for it.
  const requestedDays =
    range?.from && range?.to
      ? Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000) + 1
      : null;
  const gDateSet = new Set(gDates);
  const sDateSet = new Set(sDates);
  const missingBecause: { date: string; channels: ('appstore' | 'google')[] }[] = [];
  if (range?.from && range?.to) {
    for (let t = Date.parse(`${range.from}T00:00:00Z`); t <= Date.parse(`${range.to}T00:00:00Z`); t += 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      if (days.has(iso)) continue;
      const lacking: ('appstore' | 'google')[] = [];
      if (!sDateSet.has(iso)) lacking.push('appstore');
      if (!gDateSet.has(iso)) lacking.push('google');
      missingBecause.push({ date: iso, channels: lacking });
    }
  }

  return {
    prevFrom: hasPrev ? prevFrom : '',
    prevTo: hasPrev ? prevTo : '',
    hasPrev,
    from,
    to,
    days: dayList.length,
    channels,
    noOverlap: false,
    availableFrom,
    availableTo,
    clippedByFilter: false,
    requestedDays,
    missingDays: missingBecause.map((m) => m.date),
    missingBecause,
  };
}

// ---------------------------------------------------------------------------
// Brand demand across the two surfaces
// ---------------------------------------------------------------------------

export interface BrandTermRow {
  term: string;
  /** Google web search side. */
  gClicks: number;
  gCostNative: number;
  gCostUsd: number | null;
  gImpressions: number;
  /** App Store paid side, from the L30 window. */
  asoPaidUsers: number;
  asoPaidInstalls: number;
  /** App Store organic side — demand arriving without paying for it. */
  asoOrganicUsers: number;
  asoOrganicInstalls: number;
  /** Only Google is buying this term; the App Store side shows nothing. */
  googleOnly: boolean;
}

export interface BrandDemand {
  rows: BrandTermRow[];
  currency: string;
  gTotalCostNative: number;
  gTotalCostUsd: number | null;
  /** Share of Google spend going to terms the App Store side sees no paid traffic on. */
  googleOnlyCostShare: number | null;
}

/**
 * The same phrases bought on two different surfaces.
 *
 * Google Ads search terms are matched against the App Store's own traffic for
 * that phrase. The join is the phrase itself — it's the only key the two
 * channels share, since campaigns and keyword ids are entirely separate systems.
 *
 * The organic column matters as much as the paid one: a term with strong App
 * Store organic traffic is demand already being captured for free on that
 * surface, which changes what the Google spend is actually buying.
 */
export function brandDemand(data: SheetPayload | undefined): BrandDemand | null {
  if (!data) return null;
  const g = data.googleAds;
  if (!g || g.searchTerms.length === 0) return null;

  const gByTerm = new Map<string, { clicks: number; cost: number; impressions: number }>();
  for (const t of g.searchTerms) {
    const k = normKw(t.searchTerm);
    if (!k) continue;
    const e = gByTerm.get(k) ?? { clicks: 0, cost: 0, impressions: 0 };
    e.clicks += t.clicks;
    e.cost += t.cost;
    e.impressions += t.impressions;
    gByTerm.set(k, e);
  }

  // App Store side: the L30 window, split by surface.
  const asoPaid = new Map<string, { users: number; installs: number }>();
  const asoOrganic = new Map<string, { users: number; installs: number }>();
  for (const r of data.allL30 ?? []) {
    const k = normKw(r.searchTerm);
    if (!k) continue;
    const target = r.surface === 'search_ad' ? asoPaid : asoOrganic;
    const e = target.get(k) ?? { users: 0, installs: 0 };
    e.users += r.usersL;
    e.installs += r.getAppL;
    target.set(k, e);
  }

  const cur = g.meta?.currency || 'VND';
  const rows: BrandTermRow[] = [];
  let total = 0;
  let googleOnlyCost = 0;
  gByTerm.forEach((v, term) => {
    const p = asoPaid.get(term);
    const o = asoOrganic.get(term);
    const googleOnly = (p?.users ?? 0) === 0;
    total += v.cost;
    if (googleOnly) googleOnlyCost += v.cost;
    rows.push({
      term,
      gClicks: v.clicks,
      gCostNative: v.cost,
      gCostUsd: toUsd(v.cost, cur),
      gImpressions: v.impressions,
      asoPaidUsers: p?.users ?? 0,
      asoPaidInstalls: p?.installs ?? 0,
      asoOrganicUsers: o?.users ?? 0,
      asoOrganicInstalls: o?.installs ?? 0,
      googleOnly,
    });
  });
  rows.sort((a, b) => b.gCostNative - a.gCostNative || b.gClicks - a.gClicks);

  return {
    rows,
    currency: cur,
    gTotalCostNative: total,
    gTotalCostUsd: toUsd(total, cur),
    googleOnlyCostShare: total > 0 ? googleOnlyCost / total : null,
  };
}
