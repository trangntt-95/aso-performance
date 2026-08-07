import type { BidCapRow } from '@/lib/sheets/types';

// Per-country bid pressure: for a Country × Category cell, is the money we
// actually paid per click running ABOVE the bid the sheet recommends?
//
// This replaces the old "chưa bid ở nước X" coverage warning, which could never
// fire: 79% of camps leave Geo blank, a blank-Geo camp counts as covering every
// country, and one such camp among a keyword's camps marks everything covered.
// The question that still has an answer is not WHETHER we bid in a country, but
// whether we bid too much there.
//
// IMPORTANT — we compute CPC ourselves from spendL30 / clicksL30 and ignore the
// tab's own 'CPC Actual' column. Verified live 2026-08: that column disagrees
// with spend/clicks on every row that has both (Brand · United States reads
// $6.94 while the money says $21.05) and repeats within a category (Feature: 21
// rows carry only 3 distinct values), i.e. it's a smeared category-level
// estimate, not a per-country measurement. Only real money is trustworthy here.

export interface CountryBidPressure {
  country: string;
  category: string;
  /** spendL30 / clicksL30 — real money per click. */
  cpc: number;
  /** 'Bid Rec ⭐' for this Country × Category. */
  bidRec: number;
  /** (cpc - bidRec) / bidRec. Positive = paying above the recommendation. */
  overPct: number;
  clicksL30: number;
  spendL30: number;
  /** Coverage status from the sheet — PROVEN carries more weight than EARLY SIGNAL. */
  status: string;
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
  for (const r of bidCap) {
    if (!r.category || !r.country) continue;
    if (!(r.spendL30 > 0) || !(r.clicksL30 > 0) || !(r.bidRecommended > 0)) continue;
    const cpc = r.spendL30 / r.clicksL30;
    out.set(cellKey(r.category, r.country), {
      country: r.country,
      category: r.category,
      cpc,
      bidRec: r.bidRecommended,
      overPct: (cpc - r.bidRecommended) / r.bidRecommended,
      clicksL30: r.clicksL30,
      spendL30: r.spendL30,
      status: r.status || '',
    });
  }
  return out;
}

export interface BidPressureSummary {
  /** Countries paying above Bid Rec, worst overage first. */
  over: CountryBidPressure[];
  /** Countries measured and within the recommendation. */
  under: CountryBidPressure[];
  /** Traffic countries with no spend data at all — nothing can be said. */
  unmeasured: string[];
}

/**
 * For one keyword: of the countries it draws traffic from, which ones is its
 * category overpaying in? Resolution is Category × Country, not per keyword —
 * the sheet has no per-keyword spend — so this reads as "the category is
 * running hot in this market", which is still what a bid decision acts on.
 */
export function bidPressureFor(
  category: string,
  trafficCountries: string[],
  index: Map<string, CountryBidPressure>,
  /** Ignore cells thinner than this many clicks — CPC off 1–2 clicks is noise. */
  minClicks = 3,
): BidPressureSummary {
  const over: CountryBidPressure[] = [];
  const under: CountryBidPressure[] = [];
  const unmeasured: string[] = [];
  for (const country of trafficCountries) {
    const cell = index.get(cellKey(category, country));
    if (!cell || cell.clicksL30 < minClicks) {
      unmeasured.push(country);
      continue;
    }
    if (cell.overPct > 0) over.push(cell);
    else under.push(cell);
  }
  over.sort((a, b) => b.overPct - a.overPct);
  under.sort((a, b) => a.overPct - b.overPct);
  return { over, under, unmeasured };
}
