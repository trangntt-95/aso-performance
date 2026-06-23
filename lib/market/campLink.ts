import type { CampLinkRow } from '@/lib/sheets/types';
import { buildCampGeoIndex, type CampGeo } from '@/lib/sheets/campGeo';

// ---------------------------------------------------------------------------
// Pick ONE campaign link for a Bid Recommendations row (Country × Category).
//
// Each row already fixes a category, so the normal pick is "the camp of THAT
// category whose Geo covers this country". When the row's own category has no
// matching camp, we fall back across categories using Trang's priority order
// (brand → profit → feature → language → others → test) so the row still gets a
// useful link to open and adjust a bid. A fallback (different-category) link is
// flagged via `exactCategory: false` so the UI can mark it.
// ---------------------------------------------------------------------------

// Camp category token → 'Max bid cap' category taxonomy (same mapping as overbid).
const CAT_MAP: Record<string, string> = {
  brandname: 'Brand',
  brand: 'Brand',
  profit: 'Profit',
  competitor: 'Competitor',
  cpm: 'CPM',
  feature: 'Feature',
  others: 'Others',
  other: 'Others',
  generic: 'Others',
  'others & test': 'Others',
  language: 'Language',
  lang: 'Language',
  test: 'Test',
};

// Trang's tie-break order when several categories could serve a row.
// Categories not listed (Competitor, CPM) sink to the bottom.
const CATEGORY_PRIORITY = ['Brand', 'Profit', 'Feature', 'Language', 'Others', 'Test'];
const priorityOf = (cat: string): number => {
  const i = CATEGORY_PRIORITY.indexOf(cat);
  return i < 0 ? CATEGORY_PRIORITY.length : i;
};

/** Derive the bid-cap category of a camp: prefer the Camp_Links Category column,
 *  else parse it out of the camp name ("… TP - Profit - …"). */
function bidCapCatOf(c: CampLinkRow): string | null {
  const fromCol = CAT_MAP[c.category.trim().toLowerCase()];
  if (fromCol) return fromCol;
  const m = c.camp.match(/TP\s*-\s*([A-Za-z]+)/i);
  if (m) {
    const mapped = CAT_MAP[m[1].toLowerCase()];
    if (mapped) return mapped;
  }
  return null;
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
  camp: string;
  /** The linked camp's bid-cap category. */
  category: string;
  /** false when the linked camp's category differs from the row's (priority fallback). */
  exactCategory: boolean;
}

export interface CampLinkIndex {
  pick(country: string, category: string): CampLink | null;
}

interface Cand {
  url: string;
  camp: string;
  category: string;
  geo: CampGeo;
}

export function buildCampLinkIndex(campLinks: CampLinkRow[]): CampLinkIndex {
  const geoIndex = buildCampGeoIndex(campLinks);
  // One candidate per camp (first row with a URL wins) that has a URL + a
  // resolvable bid-cap category.
  const byCamp = new Map<string, Cand>();
  for (const c of campLinks) {
    if (!c.url || byCamp.has(c.camp)) continue;
    const cat = bidCapCatOf(c);
    if (!cat) continue;
    byCamp.set(c.camp, {
      url: c.url,
      camp: c.camp,
      category: cat,
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
        .map((c) => ({ c, cov: coverRank(c.geo, country) }))
        .filter((x): x is { c: Cand; cov: Exclude<Cov, 'no'> } => x.cov !== 'no');

      if (usable.length === 0) {
        cache.set(key, null);
        return null;
      }

      usable.sort((a, b) => {
        // 1) the row's own category always wins.
        const ax = a.c.category === category ? 0 : 1;
        const bx = b.c.category === category ? 0 : 1;
        if (ax !== bx) return ax - bx;
        // 2) when falling back across categories, follow the priority order.
        if (ax === 1) {
          const pa = priorityOf(a.c.category);
          const pb = priorityOf(b.c.category);
          if (pa !== pb) return pa - pb;
        }
        // 3) prefer the geo-specific camp, then 'all', then unknown.
        const ga = geoOrder[a.cov];
        const gb = geoOrder[b.cov];
        if (ga !== gb) return ga - gb;
        // 4) stable.
        return a.c.camp.localeCompare(b.c.camp);
      });

      const best = usable[0].c;
      const link: CampLink = {
        url: best.url,
        camp: best.camp,
        category: best.category,
        exactCategory: best.category === category,
      };
      cache.set(key, link);
      return link;
    },
  };
}
