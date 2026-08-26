import type { BidCapRow, SheetPayload, ShopifyCampRow } from '@/lib/sheets/types';
import { aggregateBidCapCells, bidCapCellsByCategory } from '@/lib/market/bidCapAgg';
import { canonicalCategoryOf, rawCategoryFromCampName } from '@/lib/market/categoryTaxonomy';
import { normalizeCampName } from '@/lib/sheets/campName';

// CPI per CATEGORY — the grain that bidding decisions are actually made at.
//
// Per-keyword CPI is not computable from this account's data and shouldn't be
// faked: money exists only at campaign level, a campaign holds ~45 keywords on
// average, and nothing in the data says how its spend divides between them.
// Category is different — a campaign belongs to exactly ONE category, so summing
// campaigns into categories is arithmetic, not attribution. Nothing is split,
// nothing is estimated.
//
// The category of a campaign comes from Camp_Links (or Master KW Lookup) where
// either knows it, and otherwise from the campaign's own name, which follows a
// consistent convention. Which of the two was used is reported per row, because
// an inferred category is a weaker claim than a recorded one.

// The naming rules and the label translation both live in categoryTaxonomy.ts
// now, so a campaign resolves to the same category here, on the camp-health
// screen, and anywhere else that asks.

export type CategorySource = 'sheet' | 'name' | 'unknown';

export interface CategoryCpiRow {
  category: string;
  camps: number;
  /** Campaigns whose category had to be inferred from the name. */
  campsInferred: number;
  impressions: number;
  clicks: number;
  installs: number;
  spend: number;
  /** spend / installs. null with no installs. */
  cpi: number | null;
  /** spend / clicks. */
  cpc: number | null;
  ctr: number | null;
  /** Share of total measured spend. */
  spendShare: number;
  /** Average 'CPI Act' across this category's Max bid cap cells. */
  cpiCap: number | null;
  /** Average 'Bid Rec' across this category's cells — what CPC is judged against. */
  bidRec: number | null;
  /** cpi / cpiCap − 1. Positive = over the ceiling. */
  vsCap: number | null;
  /** cpc / bidRec − 1. */
  vsBidRec: number | null;
  /** False when the CPI rests on 1–2 installs. */
  reliable: boolean;
  /** Campaigns in this category, biggest spender first — the drill-down. */
  topCamps: { camp: string; spend: number; installs: number; cpi: number | null }[];

  /** Same figures for the equal-length period immediately before. */
  installsPrev: number;
  spendPrev: number;
  cpiPrev: number | null;
  /** Relative change vs that period. null when the prior period has no data —
   *  never 0, since "no baseline" and "flat" are different answers. */
  installDelta: number | null;
  spendDelta: number | null;
}

export interface CategoryCpiReport {
  rows: CategoryCpiRow[];
  totalSpend: number;
  totalInstalls: number;
  /** Blended CPI across every category. */
  cpi: number | null;
  /** Spend whose category could not be determined at all. */
  unknownSpend: number;
  /** How many campaigns needed the name fallback. */
  inferredCamps: number;
  /** Date range of the underlying campaign totals. */
  range: string;
  /** The range that was ASKED for, when it differs from what data exists for. */
  requestedRange: string;
  /** Newest day the per-day export actually has. */
  dataEndsAt: string;
  /** True when the requested window is entirely newer than the export. The
   *  screen has to say this rather than vanish: an empty section reads as a bug,
   *  while "the export only goes to the 20th" is an answer. */
  rangeAheadOfData: boolean;
  /** The comparison period, as displayed. Empty when there was none. */
  prevRange: string;
  /** False when the prior period held no data at all — deltas are then null and
   *  the UI must not imply a comparison happened. */
  hasPrev: boolean;
}

/** Installs below this make a CPI a sample, not a rate. */
const RELIABLE_INSTALLS = 3;

export interface CategoryCpiOptions {
  /** Explicit day range, inclusive. Rolls up the per-day feed instead of using
   *  the precomputed L30 campaign totals. */
  range?: { from: string; to: string } | null;
  /** Trailing window in days, anchored to the newest day the per-day feed HAS.
   *  Ignored when `range` is given. Anchoring to the data rather than to today
   *  matters because the export lands a day or two behind. */
  days?: number | null;
}

const dmy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const shiftDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const spanDays = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;

/** Campaign totals for one closed range, plus which days it actually covered. */
function sumRange(
  daily: SheetPayload['shopifyDaily'],
  from: string,
  to: string,
): { camps: Map<string, ShopifyCampRow>; seenFrom: string; seenTo: string; days: number } {
  const acc = new Map<string, ShopifyCampRow>();
  const days = new Set<string>();
  let seenFrom = '';
  let seenTo = '';
  for (const r of daily ?? []) {
    if (r.date < from || r.date > to) continue;
    days.add(r.date);
    if (!seenFrom || r.date < seenFrom) seenFrom = r.date;
    if (r.date > seenTo) seenTo = r.date;
    const e = acc.get(r.camp) ?? { camp: r.camp, impressions: 0, clicks: 0, installs: 0, spend: 0 };
    e.impressions += r.impressions;
    e.clicks += r.clicks;
    e.installs += r.installs;
    e.spend += r.spend;
    acc.set(r.camp, e);
  }
  return { camps: acc, seenFrom, seenTo, days: days.size };
}

/** Campaign totals for a range, summed from the per-day feed. */
function campsForRange(
  data: SheetPayload,
  opts: CategoryCpiOptions,
): {
  camps: ShopifyCampRow[];
  prev: Map<string, ShopifyCampRow>;
  range: string;
  prevRange: string;
  hasPrev: boolean;
  requestedRange: string;
  dataEndsAt: string;
  rangeAheadOfData: boolean;
} | null {
  const daily = data.shopifyDaily ?? [];
  if (daily.length === 0) return null;

  let dataEnds = '';
  for (const r of daily) if (r.date > dataEnds) dataEnds = r.date;

  let from = opts.range?.from ?? '';
  let to = opts.range?.to ?? '';
  if (!from || !to) {
    if (!opts.days) return null;
    if (!dataEnds) return null;
    const anchor = new Date(`${dataEnds}T00:00:00Z`);
    anchor.setUTCDate(anchor.getUTCDate() - (opts.days - 1));
    from = anchor.toISOString().slice(0, 10);
    to = dataEnds;
  }
  const requestedRange = `${dmy(from)} → ${dmy(to)}`;

  const cur = sumRange(daily, from, to);
  const acc = cur.camps;
  const seenFrom = cur.seenFrom;
  const seenTo = cur.seenTo;
  if (acc.size === 0) {
    // Asked for days the export doesn't have yet. Returning null here made the
    // whole section disappear, which reads as a broken screen; the caller needs
    // enough to explain it instead.
    return {
      camps: [],
      prev: new Map(),
      range: '',
      prevRange: '',
      hasPrev: false,
      requestedRange,
      dataEndsAt: dataEnds,
      rangeAheadOfData: !!dataEnds && from > dataEnds,
    };
  }

  // The comparison period matches the days the CURRENT one actually covered, not
  // the days it asked for. With the export four days behind, an L7 window covers
  // 4 days; comparing those against a full 7-day baseline manufactures a drop
  // that never happened — the same false-delta trap the date filter had.
  const span = spanDays(seenFrom, seenTo);
  const prevTo = shiftDays(seenFrom, -1);
  const prevFrom = shiftDays(prevTo, -(span - 1));
  const prior = sumRange(daily, prevFrom, prevTo);
  // Report the days actually PRESENT, not the days asked for — a range whose
  // tail has no export yet would otherwise read as covered.
  return {
    camps: Array.from(acc.values()),
    prev: prior.camps,
    range: `${dmy(seenFrom)} → ${dmy(seenTo)}`,
    prevRange: prior.days > 0 ? `${dmy(prevFrom)} → ${dmy(prevTo)}` : '',
    hasPrev: prior.days > 0,
    requestedRange,
    dataEndsAt: dataEnds,
    rangeAheadOfData: false,
  };
}

export function buildCategoryCpi(
  data: SheetPayload | null | undefined,
  opts: CategoryCpiOptions = {},
): CategoryCpiReport | null {
  if (!data) return null;
  // A requested range rolls up the per-day feed; with no range the precomputed
  // L30 campaign totals are used as before.
  const scoped = opts.range || opts.days ? campsForRange(data, opts) : null;
  const camps: ShopifyCampRow[] = scoped ? scoped.camps : (data.shopifyCamps ?? []);
  const rangeLabel = scoped ? scoped.range : (data.shopifyDateRange ?? '');
  if (camps.length === 0) {
    // Empty because the window is ahead of the export — reportable, not nothing.
    if (scoped && scoped.rangeAheadOfData) {
      return {
        rows: [],
        totalSpend: 0,
        totalInstalls: 0,
        cpi: null,
        unknownSpend: 0,
        inferredCamps: 0,
        range: '',
        requestedRange: scoped.requestedRange,
        dataEndsAt: scoped.dataEndsAt,
        rangeAheadOfData: true,
        prevRange: '',
        hasPrev: false,
      };
    }
    return null;
  }

  const key = (s: string) => normalizeCampName(s).toLowerCase();

  // Camp_Links is the record of what a campaign is; Master KW Lookup fills gaps.
  const byCamp = new Map<string, string>();
  for (const c of data.campLinks ?? []) {
    const k = key(c.camp);
    if (k && c.category) byCamp.set(k, String(c.category).trim());
  }
  for (const r of data.masterKwLookup ?? []) {
    const k = key(r.camp);
    if (k && r.category && !byCamp.has(k)) byCamp.set(k, String(r.category).trim());
  }

  interface Acc {
    camps: number;
    campsInferred: number;
    impressions: number;
    clicks: number;
    installs: number;
    spend: number;
    members: { camp: string; spend: number; installs: number }[];
  }
  const acc = new Map<string, Acc>();
  let inferredCamps = 0;

  // Category of a campaign, resolved the same way for both periods so a camp
  // can't land in one category now and another one before.
  //
  // Whatever the raw label turns out to be, it is translated to the canonical
  // 'Max bid cap' vocabulary before being used as a key. That translation is what
  // lets the yardstick join below actually find a match: while these rows were
  // keyed 'Brandname' / 'Others & Test' / 'Category', three of the eight looked up
  // a cap and a recommended bid that the sheet does hold, under the names Brand /
  // Others / Test, and came back with nothing.
  //
  // 'Others & Test' is one group in the sheets and two categories here, so the
  // camp NAME decides which half a campaign is filed under — money has to land in
  // exactly one bucket or the total stops adding up.
  const categoryOf = (camp: string): { category: string; source: CategorySource } => {
    const fromSheet = byCamp.get(key(camp));
    if (fromSheet) {
      const canon = canonicalCategoryOf(fromSheet, camp);
      // An unrecognised label is still a recorded one; keep it visible as itself
      // instead of hiding it in Others, so a new sheet label shows up as a row to
      // be mapped rather than silently joining the catch-all.
      return { category: canon ?? fromSheet, source: 'sheet' };
    }
    const guessed = rawCategoryFromCampName(camp);
    if (guessed) {
      return { category: canonicalCategoryOf(guessed, camp) ?? guessed, source: 'name' };
    }
    return { category: '(chưa rõ category)', source: 'unknown' };
  };

  // Prior period, rolled up to categories through the same resolver.
  const prevByCat = new Map<string, { installs: number; spend: number }>();
  if (scoped?.prev) {
    scoped.prev.forEach((c) => {
      const { category } = categoryOf(c.camp);
      const e = prevByCat.get(category) ?? { installs: 0, spend: 0 };
      e.installs += c.installs;
      e.spend += c.spend;
      prevByCat.set(category, e);
    });
  }

  for (const c of camps) {
    if (c.spend <= 0 && c.clicks <= 0 && c.impressions <= 0) continue;
    const { category, source } = categoryOf(c.camp);
    if (source === 'name') inferredCamps += 1;
    const e =
      acc.get(category) ??
      { camps: 0, campsInferred: 0, impressions: 0, clicks: 0, installs: 0, spend: 0, members: [] };
    e.camps += 1;
    if (source === 'name') e.campsInferred += 1;
    e.impressions += c.impressions;
    e.clicks += c.clicks;
    e.installs += c.installs;
    e.spend += c.spend;
    e.members.push({ camp: c.camp, spend: c.spend, installs: c.installs });
    acc.set(category, e);
  }

  // The per-category yardsticks from 'Max bid cap'. The cap is set per Country ×
  // Category, so the category figure is the mean across that category's cells —
  // and a "cell" now spans several keyword-cluster rows, which is why the rows
  // are collapsed per country first (aggregateBidCapCells). Counting raw rows
  // would let a country with 14 clusters outvote one with a single cluster.
  //
  // The cap comes from the sheet's 'CPI cap' column. It used to come from that
  // tab's measured CPI, which is gone as of Aug 2026 — and was the wrong number
  // anyway: comparing what a category spent against what it spent can only ever
  // say "on target".
  const capAcc = new Map<string, { cap: number[]; rec: number[] }>();
  bidCapCellsByCategory(aggregateBidCapCells((data.bidCap ?? []) as BidCapRow[])).forEach(
    (cells, cat) => {
      const e = { cap: [] as number[], rec: [] as number[] };
      for (const c of cells) {
        if (c.cpiCap > 0) e.cap.push(c.cpiCap);
        if (c.bid > 0) e.rec.push(c.bid);
      }
      capAcc.set(cat, e);
    },
  );
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

  const totalSpend = Array.from(acc.values()).reduce((s, e) => s + e.spend, 0);
  const rows: CategoryCpiRow[] = [];
  const hasPrev = scoped?.hasPrev ?? false;
  acc.forEach((e, category) => {
    const prev = prevByCat.get(category);
    const cpi = e.installs > 0 ? e.spend / e.installs : null;
    const cpc = e.clicks > 0 ? e.spend / e.clicks : null;
    const yard = capAcc.get(category);
    const cpiCap = yard ? mean(yard.cap) : null;
    const bidRec = yard ? mean(yard.rec) : null;
    rows.push({
      category,
      camps: e.camps,
      campsInferred: e.campsInferred,
      impressions: e.impressions,
      clicks: e.clicks,
      installs: e.installs,
      spend: e.spend,
      cpi,
      cpc,
      ctr: e.impressions > 0 ? e.clicks / e.impressions : null,
      spendShare: totalSpend > 0 ? e.spend / totalSpend : 0,
      cpiCap,
      bidRec,
      vsCap: cpi !== null && cpiCap !== null && cpiCap > 0 ? cpi / cpiCap - 1 : null,
      vsBidRec: cpc !== null && bidRec !== null && bidRec > 0 ? cpc / bidRec - 1 : null,
      reliable: e.installs >= RELIABLE_INSTALLS,
      installsPrev: prev?.installs ?? 0,
      spendPrev: prev?.spend ?? 0,
      cpiPrev: prev && prev.installs > 0 ? prev.spend / prev.installs : null,
      // Null rather than 0 when there's no baseline: "nothing to compare" and
      // "unchanged" are different statements and must not render alike.
      installDelta:
        hasPrev && prev && prev.installs > 0 ? (e.installs - prev.installs) / prev.installs : null,
      spendDelta: hasPrev && prev && prev.spend > 0 ? (e.spend - prev.spend) / prev.spend : null,
      topCamps: e.members
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 8)
        .map((m) => ({ ...m, cpi: m.installs > 0 ? m.spend / m.installs : null })),
    });
  });

  rows.sort((a, b) => b.spend - a.spend);
  const totalInstalls = rows.reduce((s, r) => s + r.installs, 0);
  return {
    rows,
    totalSpend,
    totalInstalls,
    cpi: totalInstalls > 0 ? totalSpend / totalInstalls : null,
    unknownSpend: rows.filter((r) => r.category.startsWith('(')).reduce((s, r) => s + r.spend, 0),
    inferredCamps,
    range: rangeLabel,
    requestedRange: scoped?.requestedRange ?? rangeLabel,
    dataEndsAt: scoped?.dataEndsAt ?? '',
    rangeAheadOfData: false,
    prevRange: scoped?.prevRange ?? '',
    hasPrev,
  };
}
