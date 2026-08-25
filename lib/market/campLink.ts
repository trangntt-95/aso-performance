import type { CampLinkRow, MasterKwRow } from '@/lib/sheets/types';
import { buildCampGeoIndex, type CampGeo } from '@/lib/sheets/campGeo';
import { normalizeCampName } from '@/lib/sheets/campName';
import { canonicalCategoriesFor } from '@/lib/market/categoryTaxonomy';

// ---------------------------------------------------------------------------
// Pick ONE campaign link for a Bid Recommendations row (Country × Category).
//
// A row's category must MATCH the camp's category — we never suggest a camp from
// a different category (that was confusing: a Profit camp showing on a Brand
// row). Among the matching-category camps, prefer the one whose Camp_Links Geo
// actually covers this country (geo-specific > "all" > unknown geo). If no
// matching-category camp covers the country, the row simply shows no link.
//
// Camp categories come from the Camp_Links `Category` column (verified to match
// the token after "TP - " in the camp name, e.g. "TP - Brandname - Exact - US").
// ---------------------------------------------------------------------------

// Camp category → the bid-cap categories it can serve. The translation table
// lives in categoryTaxonomy.ts; this file used to keep its own copy, which then
// had to be remembered whenever a label was added in either place.
//
// A camp keeps ALL its candidates here rather than being filed under one: this
// picks a link to SUGGEST, so a camp labelled 'Others & Test' should be offered
// on both an Others row and a Test row. That is the opposite of what the money
// tables need, where a camp must land in exactly one bucket — hence two
// functions in that module rather than one.

/** The bid-cap categories a camp can serve: Camp_Links Category column first,
 *  else the token after "TP - " in the camp name. */
export function campCategories(c: CampLinkRow): string[] {
  const fromCol = canonicalCategoriesFor(c.category);
  if (fromCol.length > 0) return [...fromCol];
  const m = c.camp.match(/TP\s*-\s*([A-Za-z& ]+?)\s*-/i);
  if (m) {
    const mapped = canonicalCategoriesFor(m[1]);
    if (mapped.length > 0) return [...mapped];
  }
  return [];
}

// How a camp's Geo relates to a country: explicit include match = most specific,
// 'all' / exclude-covering = broad, unknown = no geo filled, 'no' = excluded.
type Cov = 'geo' | 'all' | 'unknown' | 'no';
function coverRank(geo: CampGeo, country: string): Cov {
  switch (geo.mode) {
    case 'all':
      return 'all';
    case 'include':
      return geo.countries.includes(country) ? 'geo' : 'no';
    case 'exclude':
      return geo.countries.includes(country) ? 'no' : 'all';
    default:
      return 'unknown';
  }
}
const geoOrder: Record<Exclude<Cov, 'no'>, number> = { geo: 0, all: 1, unknown: 2 };

export interface CampLink {
  url: string;
  /** Full campaign name, shown so the user can decide whether to open it. */
  camp: string;
  /** The matched bid-cap category (always equals the row's category). */
  category: string;
  /** How the camp's Geo matched this country — for an optional UI hint. */
  geoMatch: 'geo' | 'all' | 'unknown';
}

export interface CampLinkIndex {
  pick(country: string, category: string): CampLink | null;
}

interface Cand {
  url: string;
  camp: string;
  categories: string[];
  geo: CampGeo;
}

export function buildCampLinkIndex(
  campLinks: CampLinkRow[],
  pausedCamps: MasterKwRow[] = [],
): CampLinkIndex {
  const geoIndex = buildCampGeoIndex(campLinks);
  // Camps in Paused_camp are no longer running → never suggest one to adjust its
  // bid. Match on the note-stripped name so a paused camp renamed with a
  // "(CPI …)" tag is still recognised (same rule as overbid/underbid).
  const pausedSet = new Set(
    pausedCamps.map((p) => normalizeCampName(p.camp)).filter(Boolean),
  );
  // One candidate per camp (first row with a URL wins) that has a URL + a
  // resolvable bid-cap category and is not paused.
  const byCamp = new Map<string, Cand>();
  for (const c of campLinks) {
    if (!c.url || byCamp.has(c.camp)) continue;
    if (pausedSet.has(normalizeCampName(c.camp))) continue; // paused → skip
    const categories = campCategories(c);
    if (categories.length === 0) continue;
    byCamp.set(c.camp, {
      url: c.url,
      camp: c.camp,
      categories,
      geo: geoIndex.get(c.camp) ?? { mode: 'unknown', countries: [] },
    });
  }
  const cands = Array.from(byCamp.values());

  const cache = new Map<string, CampLink | null>();
  return {
    pick(country, category) {
      const key = `${country}||${category}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;

      const usable = cands
        .filter((c) => c.categories.includes(category)) // EXACT category only
        .map((c) => ({ c, cov: coverRank(c.geo, country) }))
        .filter((x): x is { c: Cand; cov: Exclude<Cov, 'no'> } => x.cov !== 'no');

      if (usable.length === 0) {
        cache.set(key, null);
        return null;
      }

      usable.sort((a, b) => {
        // prefer the geo-specific camp, then 'all', then unknown; stable by name.
        const ga = geoOrder[a.cov];
        const gb = geoOrder[b.cov];
        if (ga !== gb) return ga - gb;
        return a.c.camp.localeCompare(b.c.camp);
      });

      const best = usable[0];
      const link: CampLink = {
        url: best.c.url,
        camp: best.c.camp,
        category,
        geoMatch: best.cov,
      };
      cache.set(key, link);
      return link;
    },
  };
}
