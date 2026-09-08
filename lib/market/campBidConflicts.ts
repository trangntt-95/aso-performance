import type { BidCapRow, CampLinkRow } from '@/lib/sheets/types';
import { aggregateBidCapCells, bidCapCellsByCategory } from '@/lib/market/bidCapAgg';
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
//
// ── What the reported spread measures ──────────────────────────────────────
// The widest distance, for ONE keyword cluster, between the bids it is
// recommended in different countries this camp targets. The maximum of that over
// the camp's clusters is what gets reported.
//
// That phrasing is deliberate, because two different spreads live in this data
// and only one of them is fixed by the action this panel recommends:
//
//   SAME cluster, DIFFERENT countries → splitting the camp by country fixes it.
//     "B2. Brand gõ dở" wants $32.95 in Australia and $14.66 in the Netherlands;
//     one campaign cannot hold both.
//   DIFFERENT clusters, SAME country → splitting by country changes nothing.
//     Inside one market the Profit clusters span $0.21 to $20.00 by design — a
//     brand-exact term is worth more than a generic one, and Apple Search Ads
//     lets you bid per keyword, so that is a per-keyword decision, not a
//     campaign-structure one.
//
// A plain max−min over every cluster × country point mixes the two, and the
// within-country spread is by far the larger, so it dominates: measured live, it
// put both extremes of "TP - Brandname - Exact - NL, AU" inside Australia and
// reported +125% for a camp whose actual cross-country conflict is smaller.
//
// Per-country averages (the earlier version) isolate the right axis but shrink
// it: averaging a country's clusters pulls both ends toward the middle, so all 10
// flagged camps read low — "NL, AU" showed $5.85 where one cluster really differs
// by $12.95, and "Profit - Exact 01 - Tier 1,5" showed $1.08, which reads as a
// rounding difference.
//
// Holding the cluster fixed and varying only the country measures the compromise
// that survives the recommended fix, at the grain the sheet actually sets bids.
//
// perCountry is still carried at country grain — it is the list the UI shows, and
// "which markets pull which way" is a useful separate question.
// ---------------------------------------------------------------------------

export interface CampBidConflict {
  camp: string;
  url?: string;
  category: string;
  /** Target countries with a known rec bid (mean of that country's clusters),
   *  highest first. What the UI lists, so the user can see which way each market
   *  pulls. */
  perCountry: { country: string; bid: number }[];
  /** How many countries the camp targets in total (Geo include list) — may be
   *  more than perCountry.length when some have no rec bid in the app. */
  targetCount: number;
  /** The keyword cluster whose bid disagrees most across the camp's countries. */
  cluster: string;
  /** That cluster's lowest recommended bid among the targeted countries. */
  min: number;
  /** That cluster's highest recommended bid among the targeted countries. */
  max: number;
  /** (max − min) / min. */
  spreadPct: number;
  /** The countries holding the two ends — the pair a single bid must reconcile. */
  minCountry: string;
  maxCountry: string;
  /** Countries this cluster is priced in, i.e. how much the spread rests on. */
  clusterCountries: number;
  /** How many of the camp's clusters are priced in ≥2 of its countries and so
   *  could be compared at all. */
  comparableClusters: number;
  /** The same spread between per-country AVERAGES — what the earlier version
   *  reported. Carried so the UI can show how much that view understated it. */
  countrySpread: number;
}

// Only alert when the bid gap is material. Per Trang: a spread of $0.60 or less
// between countries is acceptable (one bid is fine) → alert only when the
// max−min gap is STRICTLY ABOVE $0.60.
const MAX_ACCEPTABLE_GAP = 0.6; // $

export function findCampBidConflicts(
  campLinks: CampLinkRow[],
  bidCap: BidCapRow[],
): CampBidConflict[] {
  // Two indexes at two grains, because the function needs both.
  //
  // CLUSTER — every individual recommendation, which is what the spread is taken
  // over. Read straight off the raw rows: collapsing them is exactly what used to
  // hide the size of the compromise.
  const clustersByCatCountry = new Map<string, { cluster: string; bid: number }[]>();
  for (const r of bidCap) {
    if (!r.category || !r.country) continue;
    if (!Number.isFinite(r.bidRecommended) || r.bidRecommended <= 0) continue;
    const k = `${r.category}||${r.country}`;
    const list = clustersByCatCountry.get(k) ?? [];
    list.push({ cluster: r.keywordCluster || '(không tên)', bid: r.bidRecommended });
    clustersByCatCountry.set(k, list);
  }

  // COUNTRY — the per-country mean, for the list the UI shows and for the
  // comparison figure that says how much that view understates things. Clusters
  // are collapsed per country first (aggregateBidCapCells), never taken from
  // whichever raw row happens to come last.
  const bidByCatCountry = new Map<string, Map<string, number>>();
  bidCapCellsByCategory(aggregateBidCapCells(bidCap)).forEach((cells, cat) => {
    const m = new Map<string, number>();
    for (const c of cells) {
      if (Number.isFinite(c.bid) && c.bid > 0) m.set(c.country, c.bid);
    }
    if (m.size > 0) bidByCatCountry.set(cat, m);
  });

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

    // cluster → its bid in each of this camp's countries. Holding the cluster
    // fixed is what isolates the cross-country disagreement from the (much
    // larger, and intentional) spread between clusters inside one market.
    const byCluster = new Map<string, { country: string; bid: number }[]>();
    for (const { country } of perCountry) {
      for (const cl of clustersByCatCountry.get(`${category}||${country}`) ?? []) {
        const list = byCluster.get(cl.cluster) ?? [];
        list.push({ country, bid: cl.bid });
        byCluster.set(cl.cluster, list);
      }
    }

    // The cluster that disagrees most. A cluster priced in only one of the camp's
    // countries says nothing about a cross-country conflict and is skipped.
    interface ClusterSpread {
      cluster: string;
      min: number;
      max: number;
      minCountry: string;
      maxCountry: string;
      countries: number;
    }
    const spreads: ClusterSpread[] = [];
    for (const [cluster, points] of Array.from(byCluster.entries())) {
      if (points.length < 2) continue;
      const sorted = [...points].sort((a, b) => a.bid - b.bid);
      const lo = sorted[0];
      const hi = sorted[sorted.length - 1];
      if (lo.bid <= 0) continue;
      spreads.push({
        cluster,
        min: lo.bid,
        max: hi.bid,
        minCountry: lo.country,
        maxCountry: hi.country,
        countries: points.length,
      });
    }
    // No cluster is priced in two of this camp's countries, so nothing can be
    // compared. Falling back to the country averages here would report a figure
    // the rest of the row cannot explain.
    if (spreads.length === 0) continue;
    const comparableClusters = spreads.length;
    const w = spreads.reduce((a, b) => (b.max - b.min > a.max - a.min ? b : a));
    if (w.max - w.min <= MAX_ACCEPTABLE_GAP) continue;

    const countryBids = perCountry.map((x) => x.bid);
    const countrySpread = Math.max(...countryBids) - Math.min(...countryBids);

    perCountry.sort((a, b) => b.bid - a.bid);
    out.push({
      camp: c.camp,
      url: c.url || undefined,
      category,
      perCountry,
      targetCount: geo.countries.length,
      cluster: w.cluster,
      min: w.min,
      max: w.max,
      spreadPct: (w.max - w.min) / w.min,
      minCountry: w.minCountry,
      maxCountry: w.maxCountry,
      clusterCountries: w.countries,
      comparableClusters,
      countrySpread,
    });
  }

  out.sort((a, b) => b.spreadPct - a.spreadPct);
  return out;
}
