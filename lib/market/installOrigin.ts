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
  /** Window label of the source tab. */
  window: string;
}

const numOrNull = (s: string): number | null => {
  const n = Number(String(s ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

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

  // keyword → its Master KW Lookup rows (campaign + max bid).
  const master: MasterKwRow[] = data.masterKwLookup ?? [];
  const byKeyword = new Map<string, MasterKwRow[]>();
  for (const m of master) {
    const k = normKw(m.keyword);
    if (!k) continue;
    const arr = byKeyword.get(k);
    if (arr) arr.push(m);
    else byKeyword.set(k, [m]);
  }

  // Paused campaigns, matched on the note-stripped name so an annotated label
  // in Master still resolves to its Paused_camp entry.
  const pausedNames = new Set(
    (data.pausedKw ?? []).map((r) => normalizeCampName(r.camp).toLowerCase()).filter(Boolean),
  );
  const campUrl = buildCampUrlIndex(data.campLinks ?? []);

  const rows: InstallOriginRow[] = [];
  for (const r of paidWithInstalls) {
    const key = normKw(r.searchTerm);
    const hits = byKeyword.get(key) ?? [];

    const seen = new Set<string>();
    const live: OriginCamp[] = [];
    const paused: OriginCamp[] = [];
    for (const h of hits) {
      const camp = h.camp?.trim();
      if (!camp || seen.has(camp)) continue;
      seen.add(camp);
      const isPaused = pausedNames.has(normalizeCampName(camp).toLowerCase());
      const entry: OriginCamp = {
        camp,
        bidMax: numOrNull(h.bidMax),
        url: campUrl.get(camp),
        paused: isPaused,
      };
      (isPaused ? paused : live).push(entry);
    }
    live.sort((a, b) => (b.bidMax ?? 0) - (a.bidMax ?? 0));

    const bids = live.map((c) => c.bidMax).filter((b): b is number => b !== null);
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
      camps: live,
      pausedCamps: paused,
      bidMax: bids.length > 0 ? Math.max(...bids) : null,
      bidMin: bids.length > 0 ? Math.min(...bids) : null,
      campAmbiguous: live.length > 1,
      campUnknown: hits.length === 0,
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
    window: win ? `${win.from} → ${win.to}` : 'L30',
  };
}
