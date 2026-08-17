import type { SheetPayload, KeywordRow, SnapshotRow } from '@/lib/sheets/types';
import { normKw } from '@/lib/sheets/kwNorm';
import { buildKeywordCampIndex, type OriginCamp } from './installOrigin';

// Keywords taking paid traffic and returning nothing — and, crucially, still
// being bid on. A keyword that wasted budget last month but has since been
// paused is history; one that is still live in a running campaign is a decision
// waiting to be made, and only that kind is reported here.
//
// App Store Ads only. The Google Ads side was checked and deliberately left out:
// 23 of its 27 keywords are the brand name itself, and of the four that aren't,
// the only one with real spend is a competitor term bought on purpose. A "should
// exclude" list there would be advising us to stop defending our own brand.
//
// The unit is USERS, not clicks and not money. App Store Ads reports no
// per-keyword click or spend at all — only the people who reached the listing —
// and calling that a click would invite a cost-per-click that cannot be computed.

/** Users below this are a coincidence, not a pattern. */
export const DEFAULT_WASTE_THRESHOLD = 5;

export type WasteWindow = 'L30' | 'L90';

export interface WasteKeywordRow {
  keyword: string;
  category: string;
  /** People who reached the listing from a paid tap. Not clicks, not spend. */
  users: number;
  /** Same keyword on the organic side. A keyword that converts organically but
   *  never on paid is a different problem from one that converts nowhere. */
  organicUsers: number;
  organicInstalls: number;
  /** Live (non-paused) campaigns still bidding it. */
  camps: OriginCamp[];
  bidMax: number | null;
  bidMin: number | null;
  /** Already on the Negative KW list — surfaced as a contradiction to check. */
  negative: boolean;
}

export interface WasteReport {
  threshold: number;
  window: WasteWindow;
  rows: WasteKeywordRow[];
  /** Paid users behind the reported rows. */
  users: number;
  /** Keywords that cleared the bar but are no longer bid — already handled. */
  notBidCount: number;
  /** Reported keywords that convert organically. Cutting these loses nothing
   *  paid, and the organic demand stays. */
  organicConverters: number;
}

export function buildWasteReport(
  data: SheetPayload | null | undefined,
  threshold = DEFAULT_WASTE_THRESHOLD,
  window: WasteWindow = 'L30',
): WasteReport | null {
  if (!data) return null;

  // L365 uses the SnapshotRow shape; L30/L90 use KeywordRow. Same two numbers,
  // different names, so both are read through one accessor.
  const src: (KeywordRow | SnapshotRow)[] = window === 'L90' ? (data.allL90 ?? []) : (data.allL30 ?? []);
  if (src.length === 0) return null;
  const usersOf = (r: KeywordRow | SnapshotRow) => ('usersL' in r ? r.usersL : r.users);
  const installsOf = (r: KeywordRow | SnapshotRow) => ('getAppL' in r ? r.getAppL : r.getApp);

  interface Acc {
    keyword: string;
    category: string;
    paidUsers: number;
    paidInstalls: number;
    organicUsers: number;
    organicInstalls: number;
  }
  const acc = new Map<string, Acc>();
  for (const r of src) {
    const key = normKw(r.searchTerm);
    if (!key) continue;
    const e =
      acc.get(key) ??
      {
        keyword: r.searchTerm,
        category: r.category,
        paidUsers: 0,
        paidInstalls: 0,
        organicUsers: 0,
        organicInstalls: 0,
      };
    if (r.surface === 'search_ad') {
      e.paidUsers += usersOf(r);
      e.paidInstalls += installsOf(r);
    } else {
      e.organicUsers += usersOf(r);
      e.organicInstalls += installsOf(r);
    }
    acc.set(key, e);
  }

  const campIndex = buildKeywordCampIndex(data);
  const negatives = new Set((data.negativeKw ?? []).map(normKw));

  const rows: WasteKeywordRow[] = [];
  let notBidCount = 0;
  acc.forEach((e, key) => {
    if (e.paidUsers < threshold || e.paidInstalls > 0) return;
    const camps = campIndex.get(e.keyword);
    // Still bid = at least one campaign not in Paused_camp. Without that the row
    // is history, and history isn't an action.
    if (camps.live.length === 0) {
      notBidCount += 1;
      return;
    }
    rows.push({
      keyword: e.keyword,
      category: e.category,
      users: e.paidUsers,
      organicUsers: e.organicUsers,
      organicInstalls: e.organicInstalls,
      camps: camps.live,
      bidMax: camps.bidMax,
      bidMin: camps.bidMin,
      negative: negatives.has(key),
    });
  });

  rows.sort((a, b) => b.users - a.users);

  return {
    threshold,
    window,
    rows,
    users: rows.reduce((s, r) => s + r.users, 0),
    notBidCount,
    organicConverters: rows.filter((r) => r.organicInstalls > 0).length,
  };
}
