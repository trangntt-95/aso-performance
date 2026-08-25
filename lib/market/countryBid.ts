import type { BidCapRow } from '@/lib/sheets/types';
import { aggregateBidCapCells, type BidCapCell } from '@/lib/market/bidCapAgg';

// Per-country bid pressure: for a Country × Category cell, is the bid the sheet
// recommends being held down by the tier ceiling above it?
//
// This used to answer a sharper question — "is the money we actually paid per
// click running above the recommendation?" — by computing CPC from the tab's own
// spendL30 / clicksL30. As of Aug 2026 the 'Max bid cap' tab carries no spend
// column at all (see the schema note in lib/sheets/parsers.ts), and no other tab
// breaks spend down by country: Shopify_daily is per campaign, and a campaign
// spans countries. So real CPC per Country × Category is not derivable anywhere
// in this dataset any more.
//
// Rather than divide by a zero that used to be money — which would report every
// market as costing $0.00 per click and perfectly within budget — the pressure
// now reads off the sheet's own two ceilings, which are per country and are what
// is actually left in the tab:
//
//   Bid Rec ⭐  = what to bid here
//   Tier ceil.  = the hard cap the tier imposes on that bid
//
// A recommendation sitting AT its tier ceiling is the honest remaining signal:
// the market wants a higher bid than the tier allows, so the bid is capped, not
// chosen. That is a different statement from "we are overpaying here" and the UI
// must not present it as the same one.

/** What this module can no longer measure, and why — surfaced in the UI so an
 *  empty block reads as a missing column rather than as good news. */
export const CPC_UNAVAILABLE_REASON =
  "Tab 'Max bid cap' không còn cột Spend (đổi schema 8/2026) nên không tính được CPC thực theo nước — " +
  'Shopify_daily chỉ có spend theo campaign, mà 1 campaign chạy nhiều nước.';

export interface CountryBidPressure {
  country: string;
  category: string;
  /** 'Bid Rec ⭐' for this Country × Category (mean across its keyword clusters). */
  bidRec: number;
  /** 'Tier ceil.' — the hard cap the country's tier puts on that bid. */
  tierCeiling: number;
  /** bidRec / tierCeiling. 1.0 = the recommendation is pinned at the ceiling. */
  ceilingUsePct: number;
  /** True when the recommendation is at (or within 2% of) the tier ceiling, i.e.
   *  the tier is what's setting the bid rather than the market. */
  ceilingBound: boolean;
  /** Clicks/mo behind the cell — thin cells are still thin evidence. */
  clicksL30: number;
  installsL30: number;
  /** Keyword clusters in the cell that the sheet says to cut or pause. */
  clustersToCut: number;
  clusters: number;
}

/** Key a cell by category + country. */
const cellKey = (category: string, country: string) => `${category}||${country}`;

/**
 * Index the Country × Category cells that have REAL spend behind them.
 * Cells without money are omitted entirely — a CPC derived from nothing would
 * look like a measurement and isn't one.
 */
export function buildCountryBidIndex(bidCap: BidCapRow[]): Map<string, CountryBidPressure> {
  const out = new Map<string, CountryBidPressure>();
  const cells: Map<string, BidCapCell> = aggregateBidCapCells(bidCap);
  cells.forEach((c) => {
    // No recommendation means the sheet has told us to stop buying this cell —
    // there is no bid to be under pressure.
    if (!(c.bid > 0)) return;
    const ceiling = c.tierCeiling > 0 ? c.tierCeiling : 0;
    const use = ceiling > 0 ? c.bid / ceiling : 0;
    out.set(cellKey(c.category, c.country), {
      country: c.country,
      category: c.category,
      bidRec: c.bid,
      tierCeiling: ceiling,
      ceilingUsePct: use,
      ceilingBound: ceiling > 0 && use >= 0.98,
      clicksL30: c.clicks,
      installsL30: c.installs,
      clustersToCut: c.clustersToCut,
      clusters: c.clusters,
    });
  });
  return out;
}

export interface BidPressureSummary {
  /** Countries whose recommended bid is pinned at the tier ceiling — the tier,
   *  not the market, is deciding the bid. */
  capped: CountryBidPressure[];
  /** Countries with a recommendation that still has headroom under the ceiling. */
  headroom: CountryBidPressure[];
  /** Traffic countries the sheet has no live recommendation for. */
  unmeasured: string[];
}

/**
 * For one keyword: of the countries it draws traffic from, which ones is its
 * category's recommended bid capped in? Resolution is Category × Country, not
 * per keyword — the sheet has no per-keyword figures — so this reads as "the
 * tier ceiling is binding in this market for this category".
 */
export function bidPressureFor(
  category: string,
  trafficCountries: string[],
  index: Map<string, CountryBidPressure>,
  /** Ignore cells thinner than this many clicks/mo — a cell nobody clicks says little. */
  minClicks = 3,
): BidPressureSummary {
  const capped: CountryBidPressure[] = [];
  const headroom: CountryBidPressure[] = [];
  const unmeasured: string[] = [];
  for (const country of trafficCountries) {
    const cell = index.get(cellKey(category, country));
    if (!cell || cell.clicksL30 < minClicks) {
      unmeasured.push(country);
      continue;
    }
    if (cell.ceilingBound) capped.push(cell);
    else headroom.push(cell);
  }
  capped.sort((a, b) => b.bidRec - a.bidRec);
  headroom.sort((a, b) => b.ceilingUsePct - a.ceilingUsePct);
  return { capped, headroom, unmeasured };
}
