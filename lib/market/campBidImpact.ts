import type { ShopifyDailyRow } from '@/lib/sheets/types';
import { normalizeCampName, buildCampNameResolver } from '@/lib/sheets/campName';

// Measure what a bid change ACTUALLY did to a campaign, from the per-day
// Shopify Ads export.
//
// The previous read was a proxy: it summed the paid share of the camp's
// keywords in History_Daily, because the main sheet's Shopify_daily is one
// aggregate row per camp with no time dimension. That proxy missed 34% of spend
// (camps whose names don't resolve to Master KW Lookup) and, where it did work,
// covered a median of only 31% of a camp's keywords.
//
// With per-day rows we can read the thing itself: cost per click, impressions,
// installs — before the note vs after.
//
// WINDOW SIZE. Campaigns here are thin: the biggest runs ~0.7 clicks/day, and
// only 94 of 332 clear 20 impressions/day. A one-day comparison would be pure
// noise, so we compare 14-day blocks either side of the note and refuse to
// report CPC unless both blocks clear a minimum click count. Impressions are
// ~275x denser than clicks (2.15M vs 19k over the same span), so they stay
// readable even where CPC can't be trusted — that's the signal to lead with.

const DAY_MS = 86_400_000;

export interface CampWindowStats {
  from: string;
  to: string;
  days: number;
  impressions: number;
  clicks: number;
  installs: number;
  spend: number;
  /** spend / clicks — null when the block has no clicks. */
  cpc: number | null;
  /** spend / installs — null when the block has no installs. */
  cpi: number | null;
  /** impressions per day — the dense signal, readable even at low click volume. */
  impPerDay: number;
}

export type BidImpactStatus =
  | 'measured' // both blocks have data
  | 'too-recent' // not enough days after the note yet
  | 'no-before' // no spend data before the note
  | 'no-data'; // camp has no per-day rows at all

export interface CampBidImpact {
  status: BidImpactStatus;
  noteAt: number;
  before: CampWindowStats | null;
  after: CampWindowStats | null;
  /** Relative change after vs before; null when either side is missing. */
  cpcDelta: number | null;
  impDelta: number | null;
  installDelta: number | null;
  spendDelta: number | null;
  /** False when either block is too thin for CPC to mean anything. */
  cpcReliable: boolean;
  /** Daily impressions series for the sparkline. */
  series: { t: number; v: number | null }[];
}

/** camp name (note-stripped, lowercased) → its daily rows, date-ascending. */
export interface CampDailyIndex {
  get(camp: string): ShopifyDailyRow[] | undefined;
  size: number;
}

export function buildCampDailyIndex(rows: ShopifyDailyRow[]): CampDailyIndex {
  const byCamp = new Map<string, ShopifyDailyRow[]>();
  const canonical = new Map<string, string>();
  for (const r of rows) {
    if (!r.camp) continue;
    const base = normalizeCampName(r.camp);
    if (!base) continue;
    const lc = base.toLowerCase();
    let list = byCamp.get(lc);
    if (!list) {
      list = [];
      byCamp.set(lc, list);
      canonical.set(lc, base);
    }
    list.push(r);
  }
  byCamp.forEach((list) => list.sort((a, b) => a.date.localeCompare(b.date)));
  // Same resolver the overbid table uses, so a Shopify_daily name carrying a
  // "(CPI 41)" tag still finds its rows here.
  const resolver = buildCampNameResolver(Array.from(canonical.values()));
  return {
    size: byCamp.size,
    get(camp) {
      const direct = byCamp.get(normalizeCampName(camp).toLowerCase());
      if (direct) return direct;
      const base = resolver.resolve(camp);
      return base ? byCamp.get(base.toLowerCase()) : undefined;
    },
  };
}

const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function summarise(rows: ShopifyDailyRow[], from: string, to: string): CampWindowStats | null {
  const inRange = rows.filter((r) => r.date >= from && r.date <= to);
  if (inRange.length === 0) return null;
  let impressions = 0, clicks = 0, installs = 0, spend = 0;
  const days = new Set<string>();
  for (const r of inRange) {
    impressions += r.impressions;
    clicks += r.clicks;
    installs += r.installs;
    spend += r.spend;
    days.add(r.date);
  }
  const n = Math.max(1, days.size);
  return {
    from, to, days: days.size,
    impressions, clicks, installs, spend,
    cpc: clicks > 0 ? spend / clicks : null,
    cpi: installs > 0 ? spend / installs : null,
    impPerDay: impressions / n,
  };
}

export interface BidImpactOptions {
  /** Days either side of the note to aggregate. Default 14. */
  windowDays?: number;
  /** Need at least this many days of post-note data. Default 7. */
  minAfterDays?: number;
  /** Below this many clicks in a block, CPC is not reported as reliable. Default 5. */
  minClicksForCpc?: number;
}

/**
 * Compare a campaign's spend metrics in the block before a note against the
 * block after it. The note is when the bid was changed; the blocks are what the
 * change did.
 */
export function campBidImpact(
  rows: ShopifyDailyRow[] | undefined,
  noteAtMs: number,
  opts: BidImpactOptions = {},
): CampBidImpact {
  const win = opts.windowDays ?? 14;
  const minAfter = opts.minAfterDays ?? 7;
  const minClicks = opts.minClicksForCpc ?? 5;

  const series = (rows ?? []).map((r) => ({ t: Date.parse(r.date), v: r.impressions }));
  const empty = {
    noteAt: noteAtMs, before: null, after: null,
    cpcDelta: null, impDelta: null, installDelta: null, spendDelta: null,
    cpcReliable: false, series,
  };
  if (!rows || rows.length === 0) return { ...empty, status: 'no-data' };

  // The note is the boundary: the day itself belongs to neither block, since
  // the change lands partway through it.
  const beforeTo = isoOf(noteAtMs - DAY_MS);
  const beforeFrom = isoOf(noteAtMs - win * DAY_MS);
  const afterFrom = isoOf(noteAtMs + DAY_MS);
  const afterTo = isoOf(noteAtMs + win * DAY_MS);

  const before = summarise(rows, beforeFrom, beforeTo);
  const after = summarise(rows, afterFrom, afterTo);

  const latest = rows[rows.length - 1]?.date ?? '';
  const elapsedDays = latest ? Math.floor((Date.parse(latest) - noteAtMs) / DAY_MS) : 0;
  if (elapsedDays < minAfter || !after) {
    return { ...empty, status: 'too-recent', before };
  }
  if (!before) return { ...empty, status: 'no-before', after };

  const rel = (a: number, b: number): number | null => (b > 0 ? (a - b) / b : null);
  const cpcReliable = before.clicks >= minClicks && after.clicks >= minClicks;

  return {
    status: 'measured',
    noteAt: noteAtMs,
    before,
    after,
    cpcDelta: before.cpc !== null && after.cpc !== null ? rel(after.cpc, before.cpc) : null,
    impDelta: rel(after.impPerDay, before.impPerDay),
    installDelta: rel(after.installs, before.installs),
    spendDelta: rel(after.spend, before.spend),
    cpcReliable,
    series,
  };
}
