import type { BidCapRow, PerGeoCpiCapRow, SheetPayload } from '@/lib/sheets/types';

// PerGeo_CPI_Cap holds *intent*: what we decided we're willing to pay per
// install in each country, and how much revenue that country is worth to us.
// 'Max bid cap' holds *outcome*: what each Country × Category actually spent.
//
// Neither sheet is useful alone. The cap alone can't tell you whether it's
// being respected; the outcome alone can't tell you whether a $46 CPI is a
// problem (it is in Brazil, it isn't in Hong Kong). This module is the join.
//
// The join is deliberately strict about what counts as evidence. Installs are
// small numbers here — most countries produced 1–2 in a month — so a country
// with one install is reported as one install, never smoothed into a rate that
// looks more solid than it is.

/** Below this many installs, a measured CPI is one dice roll, not a rate. */
const CPI_CONFIDENT_INSTALLS = 3;

/** How far over cap counts as "just over" rather than a real breach. */
const OVER_CAP_TOLERANCE = 0.05;

export type CapVerdict =
  /** Real installs, CPI comfortably under the ceiling. Room to push. */
  | 'under'
  /** Real installs, CPI above the ceiling. Paying more than we said we would. */
  | 'over'
  /** Money went out, nothing came back. The most expensive state. */
  | 'spending-no-install'
  /** Clicks but no spend recorded — traffic without cost data. */
  | 'traffic-only'
  /** Configured, but the account never touched it this window. */
  | 'idle';

export interface CountryCapRow {
  country: string;
  /** Revenue rank from the config sheet; null when blank. */
  rank: number | null;
  /** CPI ceiling in USD from the config sheet. */
  cap: number;
  tier1: boolean;
  note: string;

  /** Country × Category cells that exist for this country in 'Max bid cap'. */
  cells: number;
  /** Cells whose status says a campaign is actually proven there. */
  proven: number;

  impressions: number;
  clicks: number;
  installs: number;
  spend: number;

  /** spend / installs. null when there were no installs. */
  cpi: number | null;
  /** spend / clicks. null when there were no clicks. */
  cpc: number | null;
  /** cpi / cap − 1. Positive = over ceiling. null without a CPI or a cap. */
  vsCapPct: number | null;
  /** True only when installs clear CPI_CONFIDENT_INSTALLS. */
  cpiReliable: boolean;

  verdict: CapVerdict;
  /** Money spent above what the cap would have allowed for these installs. */
  overspend: number;
}

export interface CpiCapOverview {
  rows: CountryCapRow[];
  /** Countries in the config sheet with no matching row in 'Max bid cap'. */
  unmapped: string[];
  /** Countries spending money that the config sheet never gave a cap. */
  uncapped: { country: string; spend: number; installs: number; cpi: number | null }[];

  totals: {
    configured: number;
    tier1: number;
    /** Configured countries that produced at least one install. */
    withInstalls: number;
    /** Configured countries that spent money. */
    withSpend: number;
    spend: number;
    installs: number;
    /** Blended CPI across configured countries with spend. */
    cpi: number | null;
    /** Sum of per-country overspend — what respecting every cap would have saved. */
    overspend: number;
    overCount: number;
    /** Tier 1 countries that produced zero installs. */
    tier1Silent: number;
  };
}

function verdictOf(r: {
  installs: number;
  spend: number;
  clicks: number;
  cpi: number | null;
  cap: number;
}): CapVerdict {
  if (r.installs > 0) {
    if (r.cap > 0 && r.cpi !== null && r.cpi > r.cap * (1 + OVER_CAP_TOLERANCE)) return 'over';
    return 'under';
  }
  if (r.spend > 0) return 'spending-no-install';
  if (r.clicks > 0) return 'traffic-only';
  return 'idle';
}

/**
 * Join the CPI cap config against measured Country × Category performance.
 *
 * Returns null when either sheet is missing, so the caller can simply not
 * render the section rather than show an empty frame.
 */
export function buildCpiCapOverview(data: SheetPayload | null): CpiCapOverview | null {
  const config: PerGeoCpiCapRow[] = data?.perGeoCpiCap ?? [];
  const bidCap: BidCapRow[] = data?.bidCap ?? [];
  if (config.length === 0) return null;

  // Aggregate the detail table up to one row per country. Category is the wrong
  // grain here: a cap is set per country, so it has to be judged per country.
  type Agg = { cells: number; proven: number; imp: number; clicks: number; installs: number; spend: number };
  const perf = new Map<string, Agg>();
  for (const r of bidCap) {
    const key = r.country.trim().toLowerCase();
    if (!key) continue;
    const a = perf.get(key) ?? { cells: 0, proven: 0, imp: 0, clicks: 0, installs: 0, spend: 0 };
    a.cells += 1;
    if (r.status.toUpperCase().includes('PROVEN')) a.proven += 1;
    a.imp += r.impL30 || 0;
    a.clicks += r.clicksL30 || 0;
    a.installs += r.installsL30 || 0;
    a.spend += r.spendL30 || 0;
    perf.set(key, a);
  }

  const rows: CountryCapRow[] = [];
  const unmapped: string[] = [];

  for (const c of config) {
    const key = c.country.trim().toLowerCase();
    const a = perf.get(key);
    if (!a) unmapped.push(c.country);

    const installs = a?.installs ?? 0;
    const spend = a?.spend ?? 0;
    const clicks = a?.clicks ?? 0;
    const cpi = installs > 0 ? spend / installs : null;
    const cpc = clicks > 0 ? spend / clicks : null;
    const vsCapPct = cpi !== null && c.cap > 0 ? cpi / c.cap - 1 : null;

    // What the same installs should have cost at the cap. Only meaningful when
    // we actually got installs — a country that spent $40 for nothing has no
    // "should have cost", it simply shouldn't have spent.
    const overspend = cpi !== null && c.cap > 0 && cpi > c.cap ? spend - installs * c.cap : 0;

    rows.push({
      country: c.country,
      rank: c.rank,
      cap: c.cap,
      tier1: c.tier1,
      note: c.note,
      cells: a?.cells ?? 0,
      proven: a?.proven ?? 0,
      impressions: a?.imp ?? 0,
      clicks,
      installs,
      spend,
      cpi,
      cpc,
      vsCapPct,
      cpiReliable: installs >= CPI_CONFIDENT_INSTALLS,
      verdict: verdictOf({ installs, spend, clicks, cpi, cap: c.cap }),
      overspend,
    });
  }

  // Countries burning money with no cap set — the config sheet's blind spot.
  const configured = new Set(config.map((c) => c.country.trim().toLowerCase()));
  const displayName = new Map<string, string>();
  for (const r of bidCap) {
    const k = r.country.trim().toLowerCase();
    if (k && !displayName.has(k)) displayName.set(k, r.country.trim());
  }
  const uncapped = Array.from(perf.entries())
    .filter(([k, a]) => !configured.has(k) && (a.spend > 0 || a.installs > 0))
    .map(([k, a]) => ({
      country: displayName.get(k) ?? k,
      spend: a.spend,
      installs: a.installs,
      cpi: a.installs > 0 ? a.spend / a.installs : null,
    }))
    .sort((x, y) => y.spend - x.spend);

  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const installs = rows.reduce((s, r) => s + r.installs, 0);

  return {
    rows: rows.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999)),
    unmapped,
    uncapped,
    totals: {
      configured: config.length,
      tier1: config.filter((c) => c.tier1).length,
      withInstalls: rows.filter((r) => r.installs > 0).length,
      withSpend: rows.filter((r) => r.spend > 0).length,
      spend,
      installs,
      cpi: installs > 0 ? spend / installs : null,
      overspend: rows.reduce((s, r) => s + r.overspend, 0),
      overCount: rows.filter((r) => r.verdict === 'over').length,
      tier1Silent: rows.filter((r) => r.tier1 && r.installs === 0).length,
    },
  };
}
