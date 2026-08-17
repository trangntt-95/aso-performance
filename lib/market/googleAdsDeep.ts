import type { GoogleAdsPayload } from '@/lib/sheets/googleAdsTypes';
import type { PerGeoCpiCapRow, SheetPayload } from '@/lib/sheets/types';
import { toUsd } from '@/lib/config/fx';
import { isInstallAction } from './googleAdsReport';

// The five Google Ads tabs that carry a diagnosis rather than a total:
// country_daily, keyword_quality_daily, campaign_bidding_daily,
// campaign_device_daily and rsa_asset_daily.
//
// Each answers a question the campaign-level table cannot. Money per campaign
// says a campaign is expensive; money per country says WHERE it is expensive,
// and that is the only Google column that joins to the App Store side at all —
// PerGeo_CPI_Cap sets a ceiling per country, and until now nothing checked
// Google spend against it.
//
// Everything here is in the ACCOUNT currency (VND) unless a field says usd.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Account currency → USD. Unknown currency converts to 0 rather than null so
 *  the tables stay summable; the UI states which currency and rate were used. */
function usdOf(amount: number, currency: string): number {
  return toUsd(amount, currency) ?? 0;
}

// ---------------------------------------------------------------------------
// Country × cap
// ---------------------------------------------------------------------------

export interface GadsCountryRow {
  country: string;
  countryCode: string;
  impressions: number;
  clicks: number;
  cost: number;
  costUsd: number;
  /** Google's own conversion count — a mix of page views and installs. */
  conversions: number;
  ctr: number | null;
  cpcUsd: number | null;
  /** Cost per Google-reported conversion. NOT a CPI; see the note in the UI. */
  cpaUsd: number | null;
  /** CPI ceiling from PerGeo_CPI_Cap, USD. null when the country isn't configured. */
  capUsd: number | null;
  /** Revenue rank from PerGeo_CPI_Cap. */
  rank: number | null;
  tier1: boolean;
  /** True when the country is on the App Store exclude list. */
  excluded: boolean;
  campaigns: number;
}

// Countries the account is meant to stay out of on the App Store side. Spend
// landing here on Google is worth flagging even though it's a separate channel:
// the reason for excluding them (installs that never convert) doesn't change
// with the ad surface.
export const EXCLUDED_COUNTRIES = [
  'India',
  'Nigeria',
  'Vietnam',
  'Pakistan',
  'South Africa',
  'Malaysia',
  'Palestinian Territory, Occupied',
  'Saudi Arabia',
  'Morocco',
  'Kenya',
  'Dominica',
  'Bangladesh',
  'Venezuela',
] as const;

const EXCLUDED_LC = new Set(EXCLUDED_COUNTRIES.map((c) => c.toLowerCase()));
/** 'Palestinian Territory, Occupied' vs Google's 'Palestine' — match loosely. */
function isExcluded(country: string): boolean {
  const lc = country.trim().toLowerCase();
  if (EXCLUDED_LC.has(lc)) return true;
  return lc.startsWith('palestin');
}

export interface GadsCountryReport {
  rows: GadsCountryRow[];
  totalCostUsd: number;
  /** Spend in countries the App Store side excludes. */
  excludedCostUsd: number;
  /** Spend in countries PerGeo_CPI_Cap never gave a ceiling. */
  uncappedCostUsd: number;
  /** Countries with spend but no configured cap. */
  uncappedCount: number;
  /** Cost per conversion above the country's CPI cap. */
  overCapCount: number;
}

export function buildGadsCountryReport(
  gads: GoogleAdsPayload | null | undefined,
  perGeo: PerGeoCpiCapRow[],
): GadsCountryReport | null {
  const rows = gads?.countries ?? [];
  if (rows.length === 0) return null;
  const cur = gads?.meta?.currency ?? 'VND';

  const capByCountry = new Map<string, PerGeoCpiCapRow>();
  for (const c of perGeo) capByCountry.set(c.country.trim().toLowerCase(), c);

  interface Acc {
    code: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    camps: Set<string>;
  }
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    // A row Google reported for a geo id dim_country doesn't cover is still
    // real spend — keep it under the raw id rather than dropping the money.
    const name = r.countryName || `#${r.countryId}`;
    const e = acc.get(name) ?? {
      code: r.countryCode,
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      camps: new Set<string>(),
    };
    e.impressions += r.impressions;
    e.clicks += r.clicks;
    e.cost += r.cost;
    e.conversions += r.conversions;
    if (r.campaignName) e.camps.add(r.campaignName);
    acc.set(name, e);
  }

  const out: GadsCountryRow[] = [];
  acc.forEach((e, country) => {
    const cfg = capByCountry.get(country.trim().toLowerCase());
    const costUsd = usdOf(e.cost, cur);
    out.push({
      country,
      countryCode: e.code,
      impressions: e.impressions,
      clicks: e.clicks,
      cost: e.cost,
      costUsd: round2(costUsd),
      conversions: e.conversions,
      ctr: e.impressions > 0 ? e.clicks / e.impressions : null,
      cpcUsd: e.clicks > 0 ? round2(costUsd / e.clicks) : null,
      cpaUsd: e.conversions > 0 ? round2(costUsd / e.conversions) : null,
      capUsd: cfg && cfg.cap > 0 ? cfg.cap : null,
      rank: cfg?.rank ?? null,
      tier1: cfg?.tier1 ?? false,
      excluded: isExcluded(country),
      campaigns: e.camps.size,
    });
  });

  out.sort((a, b) => b.costUsd - a.costUsd);
  const spending = out.filter((r) => r.costUsd > 0);
  return {
    rows: out,
    totalCostUsd: round2(out.reduce((s, r) => s + r.costUsd, 0)),
    excludedCostUsd: round2(out.filter((r) => r.excluded).reduce((s, r) => s + r.costUsd, 0)),
    uncappedCostUsd: round2(spending.filter((r) => r.capUsd === null).reduce((s, r) => s + r.costUsd, 0)),
    uncappedCount: spending.filter((r) => r.capUsd === null).length,
    overCapCount: out.filter((r) => r.capUsd !== null && r.cpaUsd !== null && r.cpaUsd > r.capUsd).length,
  };
}

// ---------------------------------------------------------------------------
// Quality Score
// ---------------------------------------------------------------------------

/** Which of the three QS components is dragging the score down. */
export type QsCulprit = 'ad' | 'lp' | 'ctr' | 'none' | 'unknown';

export interface GadsKeywordRow {
  keyword: string;
  campaignName: string;
  adgroupName: string;
  matchType: string;
  impressions: number;
  clicks: number;
  cost: number;
  costUsd: number;
  conversions: number;
  ctr: number | null;
  cpcUsd: number | null;
  /** Latest non-null QS seen for the keyword. */
  qs: number | null;
  qsAd: string;
  qsLp: string;
  qsCtr: string;
  /** The single component to fix first. */
  culprit: QsCulprit;
  /** All below-average components, for keywords with more than one problem. */
  weakParts: QsCulprit[];
  impShare: number | null;
  lostRank: number | null;
}

const BELOW = 'BELOW_AVERAGE';

/** Fixing the landing page helps every keyword pointing at it, so when more
 *  than one component is weak the landing page is named first, then ad
 *  relevance (rewritable per ad group), then CTR (the slowest to move). */
function culpritOf(ad: string, lp: string, ctr: string): { culprit: QsCulprit; weak: QsCulprit[] } {
  const weak: QsCulprit[] = [];
  if (lp.toUpperCase() === BELOW) weak.push('lp');
  if (ad.toUpperCase() === BELOW) weak.push('ad');
  if (ctr.toUpperCase() === BELOW) weak.push('ctr');
  if (weak.length > 0) return { culprit: weak[0], weak };
  const known = [ad, lp, ctr].some((v) => v.trim() !== '');
  return { culprit: known ? 'none' : 'unknown', weak };
}

export interface GadsQualityReport {
  rows: GadsKeywordRow[];
  /** Keywords whose QS is known and below 5. */
  lowQsCount: number;
  /** Spend sitting on keywords with at least one below-average component. */
  weakCostUsd: number;
  totalCostUsd: number;
  byCulprit: { culprit: QsCulprit; keywords: number; costUsd: number }[];
}

export function buildGadsQualityReport(
  gads: GoogleAdsPayload | null | undefined,
): GadsQualityReport | null {
  const rows = gads?.keywords ?? [];
  if (rows.length === 0) return null;
  const cur = gads?.meta?.currency ?? 'VND';

  interface Acc {
    campaignName: string;
    adgroupName: string;
    matchType: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    qs: number | null;
    qsAd: string;
    qsLp: string;
    qsCtr: string;
    impShareSum: number;
    impShareN: number;
    lostRankSum: number;
    lostRankN: number;
    lastDate: string;
  }
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const key = `${r.campaignName}||${r.adgroupName}||${r.keyword}`;
    const e = acc.get(key) ?? {
      campaignName: r.campaignName,
      adgroupName: r.adgroupName,
      matchType: r.matchType,
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      qs: null,
      qsAd: '',
      qsLp: '',
      qsCtr: '',
      impShareSum: 0,
      impShareN: 0,
      lostRankSum: 0,
      lostRankN: 0,
      lastDate: '',
    };
    e.impressions += r.impressions;
    e.clicks += r.clicks;
    e.cost += r.cost;
    e.conversions += r.conversions;
    if (r.impShare !== null) { e.impShareSum += r.impShare; e.impShareN++; }
    if (r.lostRank !== null) { e.lostRankSum += r.lostRank; e.lostRankN++; }
    // Google revises the QS labels as data accumulates, so the newest day with
    // a score is the one that describes the keyword now.
    if (r.qs !== null && r.date >= e.lastDate) {
      e.lastDate = r.date;
      e.qs = r.qs;
      e.qsAd = r.qsAd;
      e.qsLp = r.qsLp;
      e.qsCtr = r.qsCtr;
    }
    acc.set(key, e);
  }

  const out: GadsKeywordRow[] = [];
  acc.forEach((e, key) => {
    const keyword = key.split('||')[2] ?? '';
    const { culprit, weak } = culpritOf(e.qsAd, e.qsLp, e.qsCtr);
    const costUsd = usdOf(e.cost, cur);
    out.push({
      keyword,
      campaignName: e.campaignName,
      adgroupName: e.adgroupName,
      matchType: e.matchType,
      impressions: e.impressions,
      clicks: e.clicks,
      cost: e.cost,
      costUsd: round2(costUsd),
      conversions: e.conversions,
      ctr: e.impressions > 0 ? e.clicks / e.impressions : null,
      cpcUsd: e.clicks > 0 ? round2(costUsd / e.clicks) : null,
      qs: e.qs,
      qsAd: e.qsAd,
      qsLp: e.qsLp,
      qsCtr: e.qsCtr,
      culprit,
      weakParts: weak,
      impShare: e.impShareN > 0 ? e.impShareSum / e.impShareN : null,
      lostRank: e.lostRankN > 0 ? e.lostRankSum / e.lostRankN : null,
    });
  });

  out.sort((a, b) => b.costUsd - a.costUsd);
  const byCulprit: GadsQualityReport['byCulprit'] = (['lp', 'ad', 'ctr'] as QsCulprit[]).map((c) => {
    const rs = out.filter((r) => r.weakParts.includes(c));
    return { culprit: c, keywords: rs.length, costUsd: round2(rs.reduce((s, r) => s + r.costUsd, 0)) };
  });

  return {
    rows: out,
    lowQsCount: out.filter((r) => r.qs !== null && r.qs < 5).length,
    weakCostUsd: round2(out.filter((r) => r.weakParts.length > 0).reduce((s, r) => s + r.costUsd, 0)),
    totalCostUsd: round2(out.reduce((s, r) => s + r.costUsd, 0)),
    byCulprit,
  };
}

// ---------------------------------------------------------------------------
// Bid strategy: target vs actual
// ---------------------------------------------------------------------------

export interface GadsBiddingRow {
  campaignName: string;
  bidStrategy: string;
  portfolio: string;
  /** Target CPA in the account currency; 0 when the strategy has none. */
  targetCpa: number;
  targetCpaUsd: number | null;
  costUsd: number;
  conversions: number;
  /** Cost per Google conversion. */
  actualCpaUsd: number | null;
  /** Cost per INSTALL action — the number the target should really be judged on. */
  installs: number;
  actualCpiUsd: number | null;
  /** actualCpa / target − 1. Positive = paying more than the target. */
  vsTarget: number | null;
}

export interface GadsBiddingReport {
  rows: GadsBiddingRow[];
  /** Campaigns whose actual CPA exceeds their own target. */
  overTargetCount: number;
  /** Campaigns running a strategy with no target set at all. */
  noTargetCount: number;
  noTargetCostUsd: number;
}

export function buildGadsBiddingReport(
  gads: GoogleAdsPayload | null | undefined,
): GadsBiddingReport | null {
  const rows = gads?.bidding ?? [];
  if (rows.length === 0) return null;
  const cur = gads?.meta?.currency ?? 'VND';

  // Installs come from the conversion-action tab, not from 'conversions':
  // Google counts page views in that column, so a target measured against it
  // would look met while barely any installs happened.
  const installsByCamp = new Map<string, number>();
  for (const a of gads?.convActions ?? []) {
    if (!isInstallAction(a.actionName)) continue;
    installsByCamp.set(a.campaignName, (installsByCamp.get(a.campaignName) ?? 0) + a.conversions);
  }

  interface Acc {
    bidStrategy: string;
    portfolio: string;
    targetCpa: number;
    cost: number;
    conversions: number;
    lastDate: string;
  }
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const e = acc.get(r.campaignName) ?? {
      bidStrategy: r.bidStrategy,
      portfolio: r.portfolio,
      targetCpa: 0,
      cost: 0,
      conversions: 0,
      lastDate: '',
    };
    e.cost += r.cost;
    e.conversions += r.conversions;
    // The target can be changed mid-window; the latest one is what's in force.
    if (r.date >= e.lastDate) {
      e.lastDate = r.date;
      e.bidStrategy = r.bidStrategy;
      e.portfolio = r.portfolio;
      e.targetCpa = r.targetCpa;
    }
    acc.set(r.campaignName, e);
  }

  const out: GadsBiddingRow[] = [];
  acc.forEach((e, campaignName) => {
    const costUsd = usdOf(e.cost, cur);
    const installs = installsByCamp.get(campaignName) ?? 0;
    const actualCpaUsd = e.conversions > 0 ? round2(costUsd / e.conversions) : null;
    const targetCpaUsd = e.targetCpa > 0 ? round2(usdOf(e.targetCpa, cur)) : null;
    out.push({
      campaignName,
      bidStrategy: e.bidStrategy,
      portfolio: e.portfolio,
      targetCpa: e.targetCpa,
      targetCpaUsd,
      costUsd: round2(costUsd),
      conversions: e.conversions,
      actualCpaUsd,
      installs,
      actualCpiUsd: installs > 0 ? round2(costUsd / installs) : null,
      vsTarget:
        targetCpaUsd !== null && actualCpaUsd !== null ? actualCpaUsd / targetCpaUsd - 1 : null,
    });
  });

  out.sort((a, b) => b.costUsd - a.costUsd);
  const noTarget = out.filter((r) => r.targetCpaUsd === null && r.costUsd > 0);
  return {
    rows: out,
    overTargetCount: out.filter((r) => r.vsTarget !== null && r.vsTarget > 0).length,
    noTargetCount: noTarget.length,
    noTargetCostUsd: round2(noTarget.reduce((s, r) => s + r.costUsd, 0)),
  };
}

// ---------------------------------------------------------------------------
// Device
// ---------------------------------------------------------------------------

export interface GadsDeviceRow {
  device: string;
  impressions: number;
  clicks: number;
  costUsd: number;
  conversions: number;
  ctr: number | null;
  cpcUsd: number | null;
  cpaUsd: number | null;
  costShare: number;
}

export function buildGadsDeviceReport(
  gads: GoogleAdsPayload | null | undefined,
): GadsDeviceRow[] {
  const rows = gads?.devices ?? [];
  if (rows.length === 0) return [];
  const cur = gads?.meta?.currency ?? 'VND';
  interface Acc { impressions: number; clicks: number; cost: number; conversions: number }
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const e = acc.get(r.device) ?? { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    e.impressions += r.impressions;
    e.clicks += r.clicks;
    e.cost += r.cost;
    e.conversions += r.conversions;
    acc.set(r.device, e);
  }
  const total = Array.from(acc.values()).reduce((s, e) => s + e.cost, 0);
  const out: GadsDeviceRow[] = [];
  acc.forEach((e, device) => {
    const costUsd = usdOf(e.cost, cur);
    out.push({
      device,
      impressions: e.impressions,
      clicks: e.clicks,
      costUsd: round2(costUsd),
      conversions: e.conversions,
      ctr: e.impressions > 0 ? e.clicks / e.impressions : null,
      cpcUsd: e.clicks > 0 ? round2(costUsd / e.clicks) : null,
      cpaUsd: e.conversions > 0 ? round2(costUsd / e.conversions) : null,
      costShare: total > 0 ? e.cost / total : 0,
    });
  });
  return out.sort((a, b) => b.costUsd - a.costUsd);
}

// ---------------------------------------------------------------------------
// RSA assets
// ---------------------------------------------------------------------------

export interface GadsAssetRow {
  assetText: string;
  fieldType: string;
  perfLabel: string;
  campaignName: string;
  adgroupName: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  /** CTR relative to the median of the same field type. */
  vsMedian: number | null;
}

export interface GadsAssetReport {
  rows: GadsAssetRow[];
  /** Assets Google itself labelled LOW. */
  lowCount: number;
  /** Assets with enough impressions to judge whose CTR is under the median. */
  belowMedianCount: number;
  byFieldType: { fieldType: string; assets: number; medianCtr: number | null }[];
}

/** Below this, a CTR is not a rate — it is one or two clicks. */
const ASSET_MIN_IMPRESSIONS = 100;

export function buildGadsAssetReport(
  gads: GoogleAdsPayload | null | undefined,
): GadsAssetReport | null {
  const rows = gads?.assets ?? [];
  if (rows.length === 0) return null;

  const median = (xs: number[]): number | null => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  // Google reports no cost at asset level, so CTR against same-field-type peers
  // is the only comparison available — a headline can't be judged against a
  // sitelink.
  const ctrByType = new Map<string, number[]>();
  for (const r of rows) {
    if (r.impressions < ASSET_MIN_IMPRESSIONS) continue;
    const arr = ctrByType.get(r.fieldType) ?? [];
    arr.push(r.clicks / r.impressions);
    ctrByType.set(r.fieldType, arr);
  }
  const medianByType = new Map<string, number | null>();
  ctrByType.forEach((v, k) => medianByType.set(k, median(v)));

  const out: GadsAssetRow[] = rows.map((r) => {
    const ctr = r.impressions > 0 ? r.clicks / r.impressions : null;
    const med = medianByType.get(r.fieldType) ?? null;
    return {
      assetText: r.assetText,
      fieldType: r.fieldType,
      perfLabel: r.perfLabel,
      campaignName: r.campaignName,
      adgroupName: r.adgroupName,
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      ctr,
      vsMedian: ctr !== null && med !== null && med > 0 ? ctr / med - 1 : null,
    };
  });

  out.sort((a, b) => b.impressions - a.impressions);
  return {
    rows: out,
    lowCount: out.filter((r) => r.perfLabel.toUpperCase() === 'LOW').length,
    belowMedianCount: out.filter(
      (r) => r.impressions >= ASSET_MIN_IMPRESSIONS && r.vsMedian !== null && r.vsMedian < 0,
    ).length,
    byFieldType: Array.from(medianByType.entries())
      .map(([fieldType, medianCtr]) => ({
        fieldType,
        assets: out.filter((r) => r.fieldType === fieldType).length,
        medianCtr,
      }))
      .sort((a, b) => b.assets - a.assets),
  };
}

/** Everything the deep tabs produce, or nulls when a tab isn't present. */
export interface GoogleAdsDeep {
  country: GadsCountryReport | null;
  quality: GadsQualityReport | null;
  bidding: GadsBiddingReport | null;
  devices: GadsDeviceRow[];
  assets: GadsAssetReport | null;
}

export function buildGoogleAdsDeep(data: SheetPayload | null | undefined): GoogleAdsDeep {
  const gads = data?.googleAds;
  return {
    country: buildGadsCountryReport(gads, data?.perGeoCpiCap ?? []),
    quality: buildGadsQualityReport(gads),
    bidding: buildGadsBiddingReport(gads),
    devices: buildGadsDeviceReport(gads),
    assets: buildGadsAssetReport(gads),
  };
}
