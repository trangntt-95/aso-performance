import type { BidCapRow, MarketTierRow, PerGeoCpiCapRow, SheetPayload } from '@/lib/sheets/types';
import { aggregateBidCapCells } from '@/lib/market/bidCapAgg';

// Is the CPI ceiling we are bidding to worth paying at all?
//
// 'Max bid cap' supplies the ceiling the bid model works to, per Country ×
// Category. The revenue block of PerGeo_CPI_Cap supplies what one install is
// actually worth in that country. Both are per-install amounts, so subtracting
// one from the other is meaningful and answers the question that decides whether
// a market should be bought: a ceiling above the value of an install loses money
// on every install bought at it, no matter how well the campaign runs.
//
// ── Why it is no longer compared against the config ceiling ────────────────
// The 'CPI Cap ($)' column of PerGeo_CPI_Cap (columns A–E) has been cleared:
// verified live 2026-09-08, the header row is intact and 0 of 124 rows carry
// data. The tab's live content sits in two other blocks — RAW DATA (revenue, cols
// I–P) and the tier block (cols S–Z).
//
// With the original column gone, this screen fell back to the tier block and used
// its 'Max bid' row as the ceiling. That silently compared two DIFFERENT UNITS:
// Max bid is money per CLICK, a CPI ceiling is money per INSTALL, and with CR
// around 20–40% a CPI ceiling should sit several times above a bid ceiling. The
// result was 37 of 40 countries reported as "over cap", with gaps up to +293%
// (Cyprus: CPI cap $58.91 against a $15 'ceiling') — a red alert that measured
// nothing except which tier had the smallest bid ceiling.
//
// Comparing the ceiling against install VALUE keeps both sides per-install and
// produces a real finding on the same data: 31 of 47 countries are bidding to a
// ceiling above what an install earns there (India $58.91 vs $0.86, Brazil $44.76
// vs $3.82).
//
// If the config column is ever refilled, its ceiling belongs back on this screen
// as a third number — but as its own column, never substituted for a bid cap.
//
// Installs and clicks per month survive the Aug 2026 schema change and are still
// reported raw: most countries produce 1–2 installs a month, and a number that
// small is stated, never smoothed into a rate that looks more solid than it is.

/** Below this many installs, activity is one dice roll, not a trend. */
const CONFIDENT_INSTALLS = 3;

/** How far the ceiling may sit above install value before it counts as a breach
 *  rather than a rounding difference. */
const OVER_VALUE_TOLERANCE = 0.05;

export type CapVerdict =
  /** The ceiling we bid to is ABOVE what an install earns here. Every install
   *  bought at that ceiling loses money — a config fault, not an execution one. */
  | 'over'
  /** The ceiling sits below install value: buying at it can pay for itself. */
  | 'under'
  /** In the bid sheet, but every keyword cluster is marked cut / pause — there is
   *  no live ceiling, so there is nothing to judge. */
  | 'no-bid'
  /** No revenue figure for this country, so its ceiling cannot be judged at all.
   *  Reported as such rather than assumed fine. */
  | 'no-value';

export interface CountryCapRow {
  country: string;
  /** Revenue rank from the config sheet; null when blank. */
  rank: number | null;
  /** CPI ceiling in USD from the config sheet ('CPI Cap ($)'), or 0 when that
   *  column is empty — which it currently is for every row. Carried so the screen
   *  can show it again the moment it is refilled, never used as a fallback. */
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

  /** sheetCpiCap / valuePerInstall − 1. Positive = the ceiling is above what an
   *  install earns. null without both numbers. */
  vsCapPct: number | null;
  /** True only when installs clear CONFIDENT_INSTALLS — qualifies the activity
   *  columns, not the ceiling comparison (which needs no traffic to be true). */
  activityReliable: boolean;

  verdict: CapVerdict;

  /** Revenue ÷ installs in this country, from the quarterly revenue block. */
  valuePerInstall: number | null;
  /** valuePerInstall − sheetCpiCap, in dollars per install. Negative means the
   *  ceiling is above what an install is worth there, so buying at it loses that
   *  much on every install however well the campaign performs. */
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
    /** Countries bidding to a ceiling above what an install earns there. */
    overCount: number;
    /** Total dollars lost per install, summed over the countries above — the size
     *  of the misconfiguration, not a spend figure. */
    lossPerInstall: number;
    /** Countries with no revenue figure, so their ceiling cannot be judged. */
    unjudgeable: number;
    /** Tier 1 countries that produced zero installs. */
    tier1Silent: number;
  };
}

function verdictOf(r: {
  sheetCpiCap: number | null;
  valuePerInstall: number | null;
  clusters: number;
  bidRec: number | null;
}): CapVerdict {
  // No live ceiling to judge — every cluster here is marked cut, or the country
  // isn't in the bid sheet at all.
  if (r.sheetCpiCap === null && r.bidRec === null) return 'no-bid';
  if (r.sheetCpiCap === null) return 'no-bid';
  // A ceiling with nothing to weigh it against. Saying so beats calling it fine.
  if (r.valuePerInstall === null || r.valuePerInstall <= 0) return 'no-value';
  if (r.sheetCpiCap > r.valuePerInstall * (1 + OVER_VALUE_TOLERANCE)) return 'over';
  return 'under';
}

/**
 * Join the CPI cap config against measured Country × Category performance.
 *
 * Returns null when either sheet is missing, so the caller can simply not
 * render the section rather than show an empty frame.
 */
/**
 * The roster of countries we have decided to buy, from the tier block.
 *
 * The original Country | Rank | CPI Cap columns of PerGeo_CPI_Cap were cleared in
 * favour of this block: one column per tier holding a bid range, with per-country
 * overrides in parentheses. The tier block is therefore the only remaining record
 * of WHICH countries are in play and which tier each sits in — worth reading, and
 * that is all this function is for.
 *
 * `cap` is deliberately left at 0. An earlier version filled it from the tier's
 * 'Max bid' row, which reads naturally ("a tier's ceiling is the top of its
 * range") and is wrong: Max bid is money per CLICK and this field is a ceiling per
 * INSTALL. Substituting one for the other reported 37 of 40 countries as over
 * their cap, purely because lower tiers bid less per click. A missing ceiling is
 * now carried as missing, and the screen judges the ceiling it does have against
 * install value instead.
 */
function rosterFromTiers(tiers: MarketTierRow[]): PerGeoCpiCapRow[] {
  const out: PerGeoCpiCapRow[] = [];
  const seen = new Set<string>();
  for (const t of tiers) {
    const isTier1 = /tier\s*1(?![,.]5)/i.test(t.tier);
    for (const c of t.countries) {
      const key = c.country.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        country: c.country,
        rank: null,
        cap: 0,
        tier1: isTier1,
        note: c.note || `${t.tier}${t.bidText ? ` · ${t.bidText} (bid/click)` : ''}`,
      });
    }
  }
  return out;
}

export function buildCpiCapOverview(data: SheetPayload | null): CpiCapOverview | null {
  const explicit: PerGeoCpiCapRow[] = data?.perGeoCpiCap ?? [];
  const config: PerGeoCpiCapRow[] =
    explicit.length > 0 ? explicit : rosterFromTiers(data?.marketTiers ?? []);
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
    const valuePerInstall = valueByCountry.get(key) ?? null;

    // Ceiling against install value, both per install. Positive means we are
    // authorised to pay more for an install than an install brings in.
    //
    // Not a spend overrun, and nothing here turns it into dollars wasted: with no
    // spend column there is no "what this should have cost", and multiplying by
    // installs would dress an allowance up as an outcome.
    const vsCapPct =
      sheetCpiCap !== null && valuePerInstall !== null && valuePerInstall > 0
        ? sheetCpiCap / valuePerInstall - 1
        : null;
    // Dollars per install left over at the ceiling. Negative = bought at the
    // ceiling, each install loses this much.
    const capHeadroom =
      valuePerInstall !== null && sheetCpiCap !== null ? valuePerInstall - sheetCpiCap : null;

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
      verdict: verdictOf({ sheetCpiCap, valuePerInstall, clusters: a?.clusters ?? 0, bidRec }),
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
  // Countries the bid sheet is buying that the tier block never listed — a bid or
  // installs exist, but nobody put the market in a tier. Read off the
  // recommendation rather than off spend, which this workbook no longer has per
  // country.
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
      // 'over' IS "ceiling above install value" now, so the two counts that used
      // to sit side by side have collapsed into one. Keeping both would print the
      // same number twice under different names.
      overCount: rows.filter((r) => r.verdict === 'over').length,
      lossPerInstall: rows
        .filter((r) => r.capHeadroom !== null && r.capHeadroom < 0)
        .reduce((t, r) => t + Math.abs(r.capHeadroom as number), 0),
      unjudgeable: rows.filter((r) => r.verdict === 'no-value').length,
      tier1Silent: rows.filter((r) => r.tier1 && r.installs === 0).length,
    },
  };
}
