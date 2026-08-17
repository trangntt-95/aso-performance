import type { SheetPayload, KeywordRow, MasterKwRow } from '@/lib/sheets/types';
import { normKw } from '@/lib/sheets/kwNorm';
import { normalizeCampName } from '@/lib/sheets/campName';
import { buildCampUrlIndex } from '@/lib/sheets/campUrl';

// Where each paid install actually came from: which keyword, in which country,
// at what position, from which campaign, at what bid.
//
// Nothing in the source data states this in one place. It has to be assembled:
//
//   Country_L30   keyword × country × surface → users, installs, position
//   Master KW     keyword                     → campaign(s) + max bid
//   Camp_Links    campaign                    → URL
//
// Two honesty constraints shape the result, and both are visible in the output
// rather than smoothed over:
//
// 1. GA4 withholds low-volume rows harder at finer grain. Of 1,027 paid
//    keyword × country rows, only ~69 carry an install count at all. This table
//    therefore describes the installs GA4 was willing to break down — it is NOT
//    the account's full install total, and must never be presented as one.
//
// 2. A keyword usually sits in several campaigns (35 of 60 matched keywords do),
//    and Camp_Links' Geo column is empty for every row, so there is no way to
//    say which campaign served a given country. Every candidate campaign is
//    listed with its own bid, and `campAmbiguous` says so outright.

/** A campaign that could have served this keyword, with the bid set there. */
export interface OriginCamp {
  camp: string;
  bidMax: number | null;
  url?: string;
  /** True when the camp appears in Paused_camp — it can't be serving now. */
  paused: boolean;
}

export interface InstallOriginRow {
  keyword: string;
  category: string;
  country: string;
  /** Users who reached the listing from paid search for this keyword × country. */
  users: number;
  installs: number;
  /** installs / users, as GA4 reported it. */
  cr: number | null;
  /** Average paid position (lower is better). */
  position: number | null;
  /** Prior-period comparisons, straight from the same row. */
  usersPrev: number;
  installsPrev: number;
  positionPrev: number | null;
  /** Every campaign that bids this keyword and is not paused. */
  camps: OriginCamp[];
  /** Paused campaigns that also bid it — shown, but never counted as the source. */
  pausedCamps: OriginCamp[];
  /** Highest live bid among the candidate campaigns. */
  bidMax: number | null;
  /** Lowest live bid — when it differs from bidMax the true bid is unknown. */
  bidMin: number | null;
  /** True when more than one live campaign could have served this. */
  campAmbiguous: boolean;
  /** True when Master KW Lookup has no row for this keyword at all. */
  campUnknown: boolean;
  /** On the Negative KW list, yet still shown here with paid traffic. Either the
   *  negative isn't applied in every campaign, or it was added after these
   *  impressions were served — both worth knowing, neither visible until now. */
  negative: boolean;
}

/** One country's paid result for a single keyword — the detail-panel slice. */
export interface KeywordCountryOrigin {
  country: string;
  users: number;
  installs: number;
  cr: number | null;
  position: number | null;
  usersPrev: number;
  installsPrev: number;
  positionPrev: number | null;
}

/**
 * Paid results per country for one keyword, installs first.
 *
 * Same source and same caveat as the Nguồn Install table: GA4 withholds
 * low-volume rows harder at country grain, so a country missing here has not
 * necessarily gone quiet — it may simply be below the threshold.
 */
export function keywordCountryOrigin(
  data: SheetPayload | null | undefined,
  keyword: string,
): KeywordCountryOrigin[] {
  if (!data || !keyword) return [];
  const key = normKw(keyword);
  return (data.countryL30 ?? [])
    .filter((r) => r.surface === 'search_ad' && normKw(r.searchTerm) === key && r.country)
    .map((r) => ({
      country: r.country as string,
      users: r.usersL,
      installs: r.getAppL,
      cr: r.crL,
      position: r.posL,
      usersPrev: r.usersP,
      installsPrev: r.getAppP,
      positionPrev: r.posP,
    }))
    .sort((a, b) => b.installs - a.installs || b.users - a.users);
}

export interface InstallOriginReport {
  rows: InstallOriginRow[];
  /** Installs covered by this breakdown. */
  installs: number;
  /** Total paid installs at the coarser (no-country) grain, for context. */
  installsAllGrain: number;
  keywords: number;
  countries: number;
  /** Rows whose campaign could not be pinned to one. */
  ambiguousRows: number;
  /** Rows with no Master KW Lookup match. */
  unknownRows: number;
  /** Rows whose keyword is on the Negative KW list but still shows paid traffic. */
  negativeRows: number;
  /** Installs attributed to keywords that are supposed to be excluded. */
  negativeInstalls: number;
  /** Window label of the source tab. */
  window: string;
}

const numOrNull = (s: string): number | null => {
  const n = Number(String(s ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Camps that bid a keyword, split into live and paused, with the bid set in each. */
export interface KeywordCamps {
  live: OriginCamp[];
  paused: OriginCamp[];
  bidMax: number | null;
  bidMin: number | null;
  /** More than one live camp — the true source of a given install is unknown. */
  ambiguous: boolean;
  /** Master KW Lookup has no row for this keyword at all. */
  unknown: boolean;
  /** Listed in the Negative KW list. */
  negative: boolean;
}

/** Build the camp/bid index once, then ask it per keyword. */
export interface KeywordCampIndex {
  get(keyword: string): KeywordCamps;
  size: number;
}

export function buildKeywordCampIndex(data: SheetPayload | null | undefined): KeywordCampIndex {
  const master: MasterKwRow[] = data?.masterKwLookup ?? [];
  const byKeyword = new Map<string, MasterKwRow[]>();
  for (const m of master) {
    const k = normKw(m.keyword);
    if (!k) continue;
    const arr = byKeyword.get(k);
    if (arr) arr.push(m);
    else byKeyword.set(k, [m]);
  }
  const pausedNames = new Set(
    (data?.pausedKw ?? []).map((r) => normalizeCampName(r.camp).toLowerCase()).filter(Boolean),
  );
  const negatives = new Set((data?.negativeKw ?? []).map(normKw).filter(Boolean));
  const campUrl = buildCampUrlIndex(data?.campLinks ?? []);
  const cache = new Map<string, KeywordCamps>();

  return {
    size: byKeyword.size,
    get(keyword: string): KeywordCamps {
      const key = normKw(keyword);
      const hit = cache.get(key);
      if (hit) return hit;
      const hits = byKeyword.get(key) ?? [];
      const seen = new Set<string>();
      const live: OriginCamp[] = [];
      const paused: OriginCamp[] = [];
      for (const h of hits) {
        const camp = h.camp?.trim();
        if (!camp || seen.has(camp)) continue;
        seen.add(camp);
        const isPaused = pausedNames.has(normalizeCampName(camp).toLowerCase());
        (isPaused ? paused : live).push({
          camp,
          bidMax: numOrNull(h.bidMax),
          url: campUrl.get(camp),
          paused: isPaused,
        });
      }
      live.sort((a, b) => (b.bidMax ?? 0) - (a.bidMax ?? 0));
      const bids = live.map((c) => c.bidMax).filter((b): b is number => b !== null);
      const out: KeywordCamps = {
        live,
        paused,
        bidMax: bids.length > 0 ? Math.max(...bids) : null,
        bidMin: bids.length > 0 ? Math.min(...bids) : null,
        ambiguous: live.length > 1,
        unknown: hits.length === 0,
        negative: negatives.has(key),
      };
      cache.set(key, out);
      return out;
    },
  };
}

/**
 * Build the keyword → country → position → campaign → bid map for paid installs.
 *
 * Returns null when the country-grain tab has no paid install rows, which is a
 * real state (GA4 can withhold all of them for a quiet period), not an error.
 */
export function buildInstallOrigin(data: SheetPayload | null | undefined): InstallOriginReport | null {
  if (!data) return null;
  const country: KeywordRow[] = data.countryL30 ?? [];
  const paidWithInstalls = country.filter((r) => r.surface === 'search_ad' && (r.getAppL ?? 0) > 0);
  if (paidWithInstalls.length === 0) return null;

  const campIndex = buildKeywordCampIndex(data);

  const rows: InstallOriginRow[] = [];
  for (const r of paidWithInstalls) {
    const camps = campIndex.get(r.searchTerm);
    rows.push({
      keyword: r.searchTerm,
      category: r.category,
      country: r.country ?? '(không rõ)',
      users: r.usersL,
      installs: r.getAppL,
      cr: r.crL,
      position: r.posL,
      usersPrev: r.usersP,
      installsPrev: r.getAppP,
      positionPrev: r.posP,
      camps: camps.live,
      pausedCamps: camps.paused,
      bidMax: camps.bidMax,
      bidMin: camps.bidMin,
      campAmbiguous: camps.ambiguous,
      campUnknown: camps.unknown,
      negative: camps.negative,
    });
  }

  rows.sort((a, b) => b.installs - a.installs || b.users - a.users);

  // Same window, one grain coarser — the gap between the two is the size of
  // what GA4 withheld, and the UI states it rather than implying full coverage.
  const allGrain = (data.allL30 ?? [])
    .filter((r) => r.surface === 'search_ad')
    .reduce((s, r) => s + (r.getAppL ?? 0), 0);

  const win = data.windowDates?.['L30'];
  return {
    rows,
    installs: rows.reduce((s, r) => s + r.installs, 0),
    installsAllGrain: allGrain,
    keywords: new Set(rows.map((r) => normKw(r.keyword))).size,
    countries: new Set(rows.map((r) => r.country)).size,
    ambiguousRows: rows.filter((r) => r.campAmbiguous).length,
    unknownRows: rows.filter((r) => r.campUnknown).length,
    negativeRows: rows.filter((r) => r.negative).length,
    negativeInstalls: rows.filter((r) => r.negative).reduce((sum, r) => sum + r.installs, 0),
    window: win ? `${win.from} → ${win.to}` : 'L30',
  };
}
