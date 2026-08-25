import type { BidCapRow, MarketTierRow, PerGeoCpiCapRow, SheetPayload } from '@/lib/sheets/types';
import { aggregateBidCapCells } from '@/lib/market/bidCapAgg';

// PerGeo_CPI_Cap holds *intent*: what we decided we're willing to pay per
// install in each country, and how much revenue that country is worth to us.
// 'Max bid cap' holds the *bid model*: the CPI ceiling and the bid it derives
// for every Country × Category × keyword cluster.
//
// Neither sheet is useful alone, and this module is the join. What the join can
// say changed in Aug 2026, when 'Max bid cap' dropped its Spend column:
//
//   BEFORE — intent vs OUTCOME. Measured CPI (spend/installs) against the
//            ceiling: "we said $30 and paid $46".
//   NOW    — intent vs ALLOWANCE. The bid sheet's own CPI cap against the
//            ceiling in the config sheet: "we said $30 and the bid model is
//            working to $46".
//
// That is a weaker claim, and the wording throughout says so. It is also the only
// claim the data still supports: no tab in this workbook breaks spend down by
// country (Shopify_daily is per campaign, and a campaign spans countries), so a
// measured per-country CPI cannot be reconstructed. The alternative — keeping the
// old fields and letting the missing column arrive as spend = 0 — would have
// reported every market as costing nothing and comfortably inside budget, which
// is the most dangerous thing this screen could say.
//
// Installs and clicks per month survive the schema change and are still reported
// raw: most countries produce 1–2 installs a month, and a number that small is
// stated, never smoothed into a rate that looks more solid than it is.

/** Below this many installs, activity is one dice roll, not a trend. */
const CONFIDENT_INSTALLS = 3;

/** How far the sheet's ceiling may sit above the config's before it's a breach. */
const OVER_CAP_TOLERANCE = 0.05;

export type CapVerdict =
  /** The bid sheet's CPI ceiling for this country sits above the one the config
   *  sheet set. The model is authorised to pay more than we agreed to. */
  | 'over'
  /** The bid sheet is working inside the configured ceiling. */
  | 'under'
  /** In the bid sheet, but every keyword cluster is marked cut / pause — there is
   *  no live recommendation, so there is nothing to compare. */
  | 'no-bid'
  /** Configured, but absent from the bid sheet entirely. */
  | 'idle';

export interface CountryCapRow {
  country: string;
  /** Revenue rank from the config sheet; null when blank. */
  rank: number | null;
  /** CPI ceiling in USD from the config sheet — what we said we'd pay. */
  cap: number;
  tier1: boolean;
  note: string;

  /** Country × Category cells this country has in 'Max bid cap'. */
  cells: number;
  /** Keyword-cluster rows behind those cells. */
  clusters: number;
  /** Clusters the sheet says to cut or pause. */
  clustersToCut: number;

  /** Mean 'CPI cap' the bid sheet is working to here, across the country's
   *  cells. null when no cell carries one. This is an allowance, NOT a measured
   *  CPI — nothing in the workbook can measure CPI per country any more. */
  sheetCpiCap: number | null;
  /** Mean 'Bid Rec ⭐' across the country's cells. null when none is live. */
  bidRec: number | null;
  /** 'Tier ceil.' — the hard bid cap the country's tier imposes. */
  tierCeiling: number | null;

  clicks: number;
  installs: number;
  /** Installs over 90 days ('Inst L90'), summed across cells. */
  instL90: number;

  /** sheetCpiCap / cap − 1. Positive = the bid sheet allows more than the config
   *  ceiling. null without both numbers. */
  vsCapPct: number | null;
  /** True only when installs clear CONFIDENT_INSTALLS — qualifies the activity
   *  columns, not the ceiling comparison (which needs no traffic to be true). */
  activityReliable: boolean;

  verdict: CapVerdict;

  /** Revenue ÷ installs in this country, from the quarterly revenue block. */
  valuePerInstall: number | null;
  /** valuePerInstall − cap. Negative means the ceiling itself is set above what
   *  an install is worth there: every install bought at the cap loses money,
   *  no matter how well the campaign performs. */
  capHeadroom: number | null;
}

export interface CpiCapOverview {
  rows: CountryCapRow[];
  /** Countries in the config sheet with no matching row in 'Max bid cap'. */
  unmapped: string[];
  /** Countries the bid sheet is buying that the config sheet never gave a cap. */
  uncapped: {
    country: string;
    bidRec: number | null;
    installs: number;
    sheetCpiCap: number | null;
  }[];

  totals: {
    configured: number;
    tier1: number;
    /** Configured countries with at least one live Bid Rec ⭐. */
    withBid: number;
    /** Configured countries that produced at least one install. */
    withInstalls: number;
    installs: number;
    /** Countries whose sheet ceiling runs above the configured one. */
    overCount: number;
    /** Largest gap between a sheet ceiling and its configured one, as a
     *  fraction. null when nothing is comparable. */
    worstGapPct: number | null;
    /** Tier 1 countries that produced zero installs. */
    tier1Silent: number;
    /** Countries whose CPI cap exceeds what an install is worth there. */
    capAboveValue: number;
  };
}

function verdictOf(r: {
  sheetCpiCap: number | null;
  cap: number;
  clusters: number;
  bidRec: number | null;
}): CapVerdict {
  if (r.clusters === 0) return 'idle';
  if (r.bidRec === null && r.sheetCpiCap === null) return 'no-bid';
  if (r.cap > 0 && r.sheetCpiCap !== null && r.sheetCpiCap > r.cap * (1 + OVER_CAP_TOLERANCE))
    return 'over';
  return 'under';
}

/**
 * Join the CPI cap config against measured Country × Category performance.
 *
 * Returns null when either sheet is missing, so the caller can simply not
 * render the section rather than show an empty frame.
 */
/**
 * The per-country ceiling, from whichever block of PerGeo_CPI_Cap holds it.
 *
 * The original Country | Rank | CPI Cap columns were cleared in favour of a tier
 * block: one column per tier with a bid range, and per-country overrides in
 * parentheses. A tier's ceiling is the UPPER end of its range, since that is what
 * "cap" means; a country's own figure beats it.
 *
 * Reading the tier block rather than requiring the old columns keeps this screen
 * alive across that restructure instead of silently disappearing.
 */
function configFromTiers(tiers: MarketTierRow[]): PerGeoCpiCapRow[] {
  const out: PerGeoCpiCapRow[] = [];
  const seen = new Set<string>();
  // Tier order in the sheet runs strongest first, so it doubles as a rank when
  // no explicit revenue rank is present.
  tiers.forEach((t, tierIdx) => {
    const isTier1 = /tier\s*1(?![,.]5)/i.test(t.tier);
    for (const c of t.countries) {
      const key = c.country.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        country: c.country,
        rank: null,
        cap: c.bidOverride ?? t.maxBid ?? 0,
        tier1: isTier1,
        note: c.note || `${t.tier}${t.bidText ? ` · ${t.bidText}` : ''}`,
      });
    }
    void tierIdx;
  });
  return out;
}

export function buildCpiCapOverview(data: SheetPayload | null): CpiCapOverview | null {
  const explicit: PerGeoCpiCapRow[] = data?.perGeoCpiCap ?? [];
  const config: PerGeoCpiCapRow[] =
    explicit.length > 0 ? explicit : configFromTiers(data?.marketTiers ?? []);
  const bidCap: BidCapRow[] = data?.bidCap ?? [];
  if (config.length === 0) return null;

  // What one install is actually worth per country, from the quarterly revenue
  // block. This is the only number that can tell whether a CEILING is sane —
  // measured CPI says how well we bought, this says whether buying was worth it.
  const valueByCountry = new Map<string, number | null>();
  const rankByCountry = new Map<string, number | null>();
  for (const r of data?.perGeoRevenue ?? []) {
    const k = r.country.trim().toLowerCase();
    valueByCountry.set(k, r.valuePerInstall);
    rankByCountry.set(k, r.rank > 0 ? r.rank : null);
  }

  // Aggregate the detail table up to one row per country. Category is the wrong
  // grain here: a cap is set per country, so it has to be judged per country.
  //
  // Two levels of collapsing happen, in this order, and the order matters. The
  // tab's rows are keyword clusters, so they are first folded into Country ×
  // Category cells (aggregateBidCapCells), and only then averaged across the
  // country's categories. Going straight from rows to a country mean would weight
  // each category by how many clusters it was split into — a country with 14
  // Competitor clusters and 1 Brand cluster would report an almost purely
  // Competitor ceiling.
  type Agg = {
    cells: number;
    clusters: number;
    clustersToCut: number;
    clicks: number;
    installs: number;
    instL90: number;
    caps: number[];
    bids: number[];
    tierCeiling: number;
  };
  const perf = new Map<string, Agg>();
  aggregateBidCapCells(bidCap).forEach((cell) => {
    const key = cell.country.trim().toLowerCase();
    if (!key) return;
    const a =
      perf.get(key) ??
      {
        cells: 0,
        clusters: 0,
        clustersToCut: 0,
        clicks: 0,
        installs: 0,
        instL90: 0,
        caps: [],
        bids: [],
        tierCeiling: 0,
      };
    a.cells += 1;
    a.clusters += cell.clusters;
    a.clustersToCut += cell.clustersToCut;
    a.clicks += cell.clicks;
    a.installs += cell.installs;
    a.instL90 += cell.instL90;
    if (cell.cpiCap > 0) a.caps.push(cell.cpiCap);
    if (cell.bid > 0) a.bids.push(cell.bid);
    // One tier ceiling per country in the sheet, so any cell's value will do.
    if (cell.tierCeiling > 0) a.tierCeiling = cell.tierCeiling;
    perf.set(key, a);
  });
  const mean = (xs: number[]): number | null =>
    xs.length ? xs.reduce((t, v) => t + v, 0) / xs.length : null;

  const rows: CountryCapRow[] = [];
  const unmapped: string[] = [];

  for (const c of config) {
    const key = c.country.trim().toLowerCase();
    const a = perf.get(key);
    if (!a) unmapped.push(c.country);

    const installs = a?.installs ?? 0;
    const clicks = a?.clicks ?? 0;
    const sheetCpiCap = a ? mean(a.caps) : null;
    const bidRec = a ? mean(a.bids) : null;
    // The gap is between two CEILINGS — what the bid sheet is working to versus
    // what the config sheet authorised. It is not a spend overrun, and nothing
    // here converts it into dollars wasted: with no spend column there is no
    // "what this should have cost", and inventing one from installs × cap would
    // dress an allowance up as an outcome.
    const vsCapPct = sheetCpiCap !== null && c.cap > 0 ? sheetCpiCap / c.cap - 1 : null;

    const valuePerInstall = valueByCountry.get(key) ?? null;
    const capHeadroom =
      valuePerInstall !== null && c.cap > 0 ? valuePerInstall - c.cap : null;

    rows.push({
      country: c.country,
      // Falls back to the revenue block's rank when the config has none — the
      // tier block carries no rank column of its own.
      rank: c.rank ?? rankByCountry.get(key) ?? null,
      cap: c.cap,
      tier1: c.tier1,
      note: c.note,
      cells: a?.cells ?? 0,
      clusters: a?.clusters ?? 0,
      clustersToCut: a?.clustersToCut ?? 0,
      sheetCpiCap,
      bidRec,
      tierCeiling: a && a.tierCeiling > 0 ? a.tierCeiling : null,
      clicks,
      installs,
      instL90: a?.instL90 ?? 0,
      vsCapPct,
      activityReliable: installs >= CONFIDENT_INSTALLS,
      verdict: verdictOf({ sheetCpiCap, cap: c.cap, clusters: a?.clusters ?? 0, bidRec }),
      valuePerInstall,
      capHeadroom,
    });
  }

  // Countries burning money with no cap set — the config sheet's blind spot.
  const configured = new Set(config.map((c) => c.country.trim().toLowerCase()));
  const displayName = new Map<string, string>();
  for (const r of bidCap) {
    const k = r.country.trim().toLowerCase();
    if (k && !displayName.has(k)) displayName.set(k, r.country.trim());
  }
  // "Buying without a cap" is now read off the recommendation rather than off
  // spend: a country the bid sheet still hands a live bid to, or that produced
  // installs, while the config sheet never gave it a ceiling.
  const uncapped = Array.from(perf.entries())
    .filter(([k, a]) => !configured.has(k) && (a.bids.length > 0 || a.installs > 0))
    .map(([k, a]) => ({
      country: displayName.get(k) ?? k,
      bidRec: mean(a.bids),
      installs: a.installs,
      sheetCpiCap: mean(a.caps),
    }))
    .sort((x, y) => (y.bidRec ?? 0) - (x.bidRec ?? 0));

  const installs = rows.reduce((t, r) => t + r.installs, 0);
  const gaps = rows.map((r) => r.vsCapPct).filter((v): v is number => v !== null);

  return {
    rows: rows.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999)),
    unmapped,
    uncapped,
    totals: {
      configured: config.length,
      tier1: config.filter((c) => c.tier1).length,
      withBid: rows.filter((r) => r.bidRec !== null).length,
      withInstalls: rows.filter((r) => r.installs > 0).length,
      installs,
      overCount: rows.filter((r) => r.verdict === 'over').length,
      worstGapPct: gaps.length ? Math.max(...gaps) : null,
      tier1Silent: rows.filter((r) => r.tier1 && r.installs === 0).length,
      capAboveValue: rows.filter((r) => r.capHeadroom !== null && r.capHeadroom < 0).length,
    },
  };
}
