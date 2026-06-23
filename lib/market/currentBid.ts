import type { MasterKwRow } from '@/lib/sheets/types';

// "Current bid" we actually have set, derived from the `Bid (max)` column of
// Master KW Lookup. Master has NO country dimension, so this is a CATEGORY-level
// median (same value shown on every country row of that category in the Bid
// Recommendations table). Paused-camp rows are excluded.

export interface CurrentBidStat {
  median: number;
  avg: number;
  count: number;
}

// Master KW Lookup category label → 'Max bid cap' category. 'Others & Test' is
// combined in Master but split in the bid-cap sheet → feeds both.
const MASTER_TO_BIDCAP: Record<string, string[]> = {
  brandname: ['Brand'],
  brand: ['Brand'],
  profit: ['Profit'],
  competitor: ['Competitor'],
  cpm: ['CPM'],
  feature: ['Feature'],
  language: ['Language'],
  others: ['Others'],
  test: ['Test'],
  'others & test': ['Others', 'Test'],
};

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
    const targets = MASTER_TO_BIDCAP[r.category.trim().toLowerCase()];
    if (!targets) continue;
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
