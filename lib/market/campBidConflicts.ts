import type { BidCapRow, CampLinkRow } from '@/lib/sheets/types';
import { buildCampGeoIndex } from '@/lib/sheets/campGeo';
import { campCategories } from './campLink';

// ---------------------------------------------------------------------------
// Flag campaigns that target SEVERAL specific countries whose recommended bids
// differ. An Apple Search Ads campaign carries a single bid, so when one camp
// spans (e.g.) US rec $5 + Canada rec $3, no single bid is right for both →
// the user should split the camp by country or bid per-country. We only look at
// camps with an explicit country list (Camp_Links Geo "include" mode); "all" /
// "exclude" / blank-geo camps target broadly on purpose and aren't actionable
// the same way.
// ---------------------------------------------------------------------------

export interface CampBidConflict {
  camp: string;
  url?: string;
  category: string;
  /** Target countries with a known rec bid, highest bid first. */
  perCountry: { country: string; bid: number }[];
  /** How many countries the camp targets in total (Geo include list) — may be
   *  more than perCountry.length when some have no rec bid in the app. */
  targetCount: number;
  min: number;
  max: number;
  /** (max − min) / min. */
  spreadPct: number;
}

// Only alert when the bid gap is material. Per Trang: a spread of $0.60 or less
// between countries is acceptable (one bid is fine) → alert only when the
// max−min gap is STRICTLY ABOVE $0.60.
const MAX_ACCEPTABLE_GAP = 0.6; // $

export function findCampBidConflicts(
  campLinks: CampLinkRow[],
  bidCap: BidCapRow[],
): CampBidConflict[] {
  // category → (country → bidRecommended)
  const bidByCatCountry = new Map<string, Map<string, number>>();
  for (const r of bidCap) {
    if (!r.category || !r.country) continue;
    if (!Number.isFinite(r.bidRecommended) || r.bidRecommended <= 0) continue;
    let m = bidByCatCountry.get(r.category);
    if (!m) { m = new Map(); bidByCatCountry.set(r.category, m); }
    m.set(r.country, r.bidRecommended);
  }

  const geoIndex = buildCampGeoIndex(campLinks);
  const seen = new Set<string>();
  const out: CampBidConflict[] = [];

  for (const c of campLinks) {
    if (seen.has(c.camp)) continue;
    seen.add(c.camp);
    const geo = geoIndex.get(c.camp);
    if (!geo || geo.mode !== 'include' || geo.countries.length < 2) continue; // only explicit multi-country camps
    const category = campCategories(c)[0];
    if (!category) continue;
    const bidMap = bidByCatCountry.get(category);
    if (!bidMap) continue;

    const perCountry = geo.countries
      .map((country) => ({ country, bid: bidMap.get(country) }))
      .filter((x): x is { country: string; bid: number } => typeof x.bid === 'number');
    if (perCountry.length < 2) continue;

    const bids = perCountry.map((x) => x.bid);
    const min = Math.min(...bids);
    const max = Math.max(...bids);
    if (min <= 0) continue;
    const spreadPct = (max - min) / min;
    if (max - min <= MAX_ACCEPTABLE_GAP) continue;

    perCountry.sort((a, b) => b.bid - a.bid);
    out.push({
      camp: c.camp,
      url: c.url || undefined,
      category,
      perCountry,
      targetCount: geo.countries.length,
      min,
      max,
      spreadPct,
    });
  }

  out.sort((a, b) => b.spreadPct - a.spreadPct);
  return out;
}
