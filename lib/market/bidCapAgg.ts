import type { BidCapRow } from '@/lib/sheets/types';

// The 'Max bid cap' tab changed grain in Aug 2026: it used to hold ONE row per
// Country × Category and now holds one per Country × Category × Keyword Cluster
// (1–14 rows per cell). Everything that reads it therefore has to say which
// grain it means, because the two answer different questions:
//
//   - a CLUSTER row is what you actually set a bid on;
//   - a Country × Category CELL is what a campaign maps to;
//   - a CATEGORY is what a camp with no declared geo gets benchmarked against.
//
// Averaging raw rows skips that decision and gets it wrong in a way that is easy
// to miss: a country with 14 Competitor clusters would count 14× as much toward
// the category average as a country with one, so the benchmark drifts toward
// whichever markets happen to be split most finely. Both aggregations below
// collapse clusters per country first, then combine countries equally.
//
// Rows the sheet has told us to stop buying carry a blank Bid Rec ⭐ / CPI cap
// (825 of 1501 rows). Those blanks arrive as 0 and are EXCLUDED rather than
// averaged in as zero — a cut cluster has no recommended bid, which is not the
// same as a recommended bid of nothing.

/** One Country × Category cell, with its clusters collapsed into one view. */
export interface BidCapCell {
  country: string;
  category: string;
  tier: string;
  countryCode: string;
  /** Mean Bid Rec ⭐ across the clusters that still have one. 0 = none do. */
  bid: number;
  /** Mean CPI cap across the clusters that still have one. 0 = none do. */
  cpiCap: number;
  /** Highest Bid Rec ⭐ among the cell's clusters — the ceiling a single campaign
   *  bid would have to sit under to be safe for every cluster it covers. */
  bidMax: number;
  /** Lowest Bid Rec ⭐ among the clusters that have one. */
  bidMin: number;
  /** Tier ceiling — one value per country in the sheet, so any cluster's will do. */
  tierCeiling: number;
  clicks: number;
  installs: number;
  instL90: number;
  /** Total cluster rows behind this cell. */
  clusters: number;
  /** Clusters that still carry a Bid Rec ⭐ (i.e. are not marked to cut). */
  clustersWithBid: number;
  /** Clusters whose Action tells you to cut or pause. */
  clustersToCut: number;
}

const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;

/** Action strings that mean "stop buying this cluster" rather than "adjust it". */
export const isCutAction = (action: string): boolean => /c[ắa]t|pause/i.test(action);

const cellKey = (country: string, category: string) => `${country}||${category}`;

/**
 * Collapse cluster rows into one row per Country × Category. Cells whose every
 * cluster is blank still come back (with bid 0) so callers can tell "this market
 * is in the sheet with nothing to bid" apart from "this market isn't in the
 * sheet at all" — a distinction the empty-map version of this used to lose.
 */
export function aggregateBidCapCells(bidCap: BidCapRow[]): Map<string, BidCapCell> {
  interface Acc extends Omit<BidCapCell, 'bid' | 'cpiCap' | 'bidMax' | 'bidMin'> {
    bids: number[];
    caps: number[];
  }
  const acc = new Map<string, Acc>();
  for (const r of bidCap) {
    if (!r.country || !r.category) continue;
    const k = cellKey(r.country, r.category);
    let a = acc.get(k);
    if (!a) {
      a = {
        country: r.country,
        category: r.category,
        tier: r.tier,
        countryCode: r.countryCode,
        tierCeiling: 0,
        clicks: 0,
        installs: 0,
        instL90: 0,
        clusters: 0,
        clustersWithBid: 0,
        clustersToCut: 0,
        bids: [],
        caps: [],
      };
      acc.set(k, a);
    }
    a.clusters += 1;
    a.clicks += r.clicksL30;
    a.installs += r.installsL30;
    a.instL90 += r.instL90;
    if (r.tierCeiling > 0) a.tierCeiling = r.tierCeiling;
    if (r.bidRecommended > 0) {
      a.bids.push(r.bidRecommended);
      a.clustersWithBid += 1;
    }
    if (r.cpiCap > 0) a.caps.push(r.cpiCap);
    if (isCutAction(r.actionRecommended)) a.clustersToCut += 1;
  }
  const out = new Map<string, BidCapCell>();
  acc.forEach((a, k) => {
    const { bids, caps, ...rest } = a;
    out.set(k, {
      ...rest,
      bid: mean(bids),
      cpiCap: mean(caps),
      bidMax: bids.length ? Math.max(...bids) : 0,
      bidMin: bids.length ? Math.min(...bids) : 0,
    });
  });
  return out;
}

/** Look a cell up by country + category. */
export const getBidCapCell = (
  cells: Map<string, BidCapCell>,
  country: string,
  category: string,
): BidCapCell | undefined => cells.get(cellKey(country, category));

/** All cells of one category, one per country. */
export function bidCapCellsByCategory(cells: Map<string, BidCapCell>): Map<string, BidCapCell[]> {
  const out = new Map<string, BidCapCell[]>();
  cells.forEach((c) => {
    const list = out.get(c.category) ?? [];
    list.push(c);
    out.set(c.category, list);
  });
  return out;
}
