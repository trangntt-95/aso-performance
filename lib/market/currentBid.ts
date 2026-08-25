import type { MasterKwRow } from '@/lib/sheets/types';
import { canonicalCategoriesFor } from '@/lib/market/categoryTaxonomy';

// "Current bid" we actually have set, derived from the `Bid (max)` column of
// Master KW Lookup. Master has NO country dimension, so this is a CATEGORY-level
// median (same value shown on every country row of that category in the Bid
// Recommendations table). Paused-camp rows are excluded.

export interface CurrentBidStat {
  median: number;
  avg: number;
  count: number;
}

// Master KW Lookup labels its categories in the sheets' dialect ('Brandname',
// 'Others & Test'); the bid-cap categories these bids are compared against use
// the canonical one. The translation lives in categoryTaxonomy.ts — this file
// used to carry a second copy of it, and the two could drift apart without
// anything failing loudly.
//
// A label feeding SEVERAL categories is correct here: 'Others & Test' is one
// group in Master and two in the bid-cap sheet, and a bid recorded against that
// group is evidence for both.

export function currentBidByCategory(
  master: MasterKwRow[],
  pausedCamps: MasterKwRow[] = [],
): Map<string, CurrentBidStat> {
  const pausedSet = new Set(pausedCamps.map((p) => p.camp).filter(Boolean));
  const groups = new Map<string, number[]>();
  for (const r of master) {
    if (pausedSet.has(r.camp)) continue; // skip paused camps
    const bid = Number(r.bidMax);
    if (!Number.isFinite(bid) || bid <= 0) continue;
    const targets = canonicalCategoriesFor(r.category);
    if (targets.length === 0) continue;
    for (const t of targets) {
      const arr = groups.get(t) ?? [];
      arr.push(bid);
      groups.set(t, arr);
    }
  }
  const out = new Map<string, CurrentBidStat>();
  groups.forEach((arr, cat) => {
    arr.sort((a, b) => a - b);
    const median = arr[Math.floor(arr.length / 2)];
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    out.set(cat, { median, avg, count: arr.length });
  });
  return out;
}

/** Action from current set bid vs the recommended bid (Bid Rec ⭐). */
export function deriveBidAction(bidNow: number | null, rec: number): string {
  if (bidNow === null || !Number.isFinite(bidNow) || !rec) return '';
  const ratio = bidNow / rec;
  if (ratio < 0.85) return 'RAISE BID';
  if (ratio > 1.15) return 'REDUCE BID';
  return 'HOLD';
}
