import type { CampLinkRow } from '@/lib/sheets/types';
import { buildCampGeoIndex, type CampGeo } from '@/lib/sheets/campGeo';

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

// Camp_Links Category column → 'Max bid cap' bid-cap category(ies). The bid-cap
// table uses: Brand, Profit, Competitor, CPM, Feature, Language, Others, Test.
// NB 'Others & Test' is ONE camp group that serves BOTH the Others and Test
// bid-cap categories, so it maps to two. 'Category' (generic Finance/Marketing/
// Analytics broad camps) has no bid-cap counterpart → unmapped, never suggested.
const CAT_MAP: Record<string, string[]> = {
  brandname: ['Brand'],
  brand: ['Brand'],
  profit: ['Profit'],
  competitor: ['Competitor'],
  cpm: ['CPM'],
  feature: ['Feature'],
  language: ['Language'],
  lang: ['Language'],
  others: ['Others'],
  test: ['Test'],
  'others & test': ['Others', 'Test'],
};

/** The bid-cap categories a camp can serve: Camp_Links Category column first,
 *  else the token after "TP - " in the camp name. */
function campCategories(c: CampLinkRow): string[] {
  const fromCol = CAT_MAP[c.category.trim().toLowerCase()];
  if (fromCol) return fromCol;
  const m = c.camp.match(/TP\s*-\s*([A-Za-z& ]+?)\s*-/i);
  if (m) {
    const mapped = CAT_MAP[m[1].trim().toLowerCase()];
    if (mapped) return mapped;
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

export function buildCampLinkIndex(campLinks: CampLinkRow[]): CampLinkIndex {
  const geoIndex = buildCampGeoIndex(campLinks);
  // One candidate per camp (first row with a URL wins) that has a URL + a
  // resolvable bid-cap category.
  const byCamp = new Map<string, Cand>();
  for (const c of campLinks) {
    if (!c.url || byCamp.has(c.camp)) continue;
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
