import type { BidCapRow, SheetPayload, ShopifyCampRow } from '@/lib/sheets/types';
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

/** Category → the naming pattern that identifies it. Order matters: the first
 *  match wins, so the catch-all "Test" rule sits last. */
const NAME_RULES: [RegExp, string][] = [
  [/^tp\s*[-_]\s*profit/i, 'Profit'],
  [/^tp\s*[-_]\s*feature/i, 'Feature'],
  [/^tp\s*[-_]\s*competitor/i, 'Competitor'],
  // 'Cateogry' is a long-standing typo in the account and has to be matched.
  [/^tp\s*[-_]\s*(cat[eo]{2}gry|category|cate\s*page)/i, 'Category'],
  [/^tp\s*[-_]\s*cpm/i, 'CPM'],
  [/^tp\s*[-_]\s*brand\s*name|^tp\s*[-_]\s*brandname/i, 'Brandname'],
  // '_' is a word character, so \b after 'languages' never matches
  // 'TP_Languages_Spanish' — the boundary has to be spelled out as "not a letter".
  [/^tp[\s_-]*(foreign\s*)?languages?(?![a-z])/i, 'Language'],
  [/^tp\s*[-_]\s*others?/i, 'Others & Test'],
  // '[12.04] Test …' — a dated test campaign.
  [/^\s*\[\d{1,2}[.,]\d{1,2}\]/, 'Others & Test'],
  [/\btest\b/i, 'Others & Test'],
];

function categoryFromName(camp: string): string | null {
  const s = normalizeCampName(camp).replace(/^!+\s*/, '');
  for (const [re, cat] of NAME_RULES) if (re.test(s)) return cat;
  return null;
}

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

/** Campaign totals for a range, summed from the per-day feed. */
function campsForRange(
  data: SheetPayload,
  opts: CategoryCpiOptions,
): { camps: ShopifyCampRow[]; range: string } | null {
  const daily = data.shopifyDaily ?? [];
  if (daily.length === 0) return null;

  let from = opts.range?.from ?? '';
  let to = opts.range?.to ?? '';
  if (!from || !to) {
    if (!opts.days) return null;
    let last = '';
    for (const r of daily) if (r.date > last) last = r.date;
    if (!last) return null;
    const anchor = new Date(`${last}T00:00:00Z`);
    anchor.setUTCDate(anchor.getUTCDate() - (opts.days - 1));
    from = anchor.toISOString().slice(0, 10);
    to = last;
  }

  const acc = new Map<string, ShopifyCampRow>();
  let seenFrom = '';
  let seenTo = '';
  for (const r of daily) {
    if (r.date < from || r.date > to) continue;
    if (!seenFrom || r.date < seenFrom) seenFrom = r.date;
    if (r.date > seenTo) seenTo = r.date;
    const e = acc.get(r.camp) ?? { camp: r.camp, impressions: 0, clicks: 0, installs: 0, spend: 0 };
    e.impressions += r.impressions;
    e.clicks += r.clicks;
    e.installs += r.installs;
    e.spend += r.spend;
    acc.set(r.camp, e);
  }
  if (acc.size === 0) return null;
  const dmy = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  // Report the days actually PRESENT, not the days asked for — a range whose
  // tail has no export yet would otherwise read as covered.
  return { camps: Array.from(acc.values()), range: `${dmy(seenFrom)} → ${dmy(seenTo)}` };
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
  if (camps.length === 0) return null;

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

  for (const c of camps) {
    if (c.spend <= 0 && c.clicks <= 0 && c.impressions <= 0) continue;
    let category = byCamp.get(key(c.camp));
    let source: CategorySource = 'sheet';
    if (!category) {
      const guess = categoryFromName(c.camp);
      if (guess) {
        category = guess;
        source = 'name';
        inferredCamps += 1;
      }
    }
    if (!category) {
      category = '(chưa rõ category)';
      source = 'unknown';
    }
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

  // The per-category yardsticks from 'Max bid cap'. Averaged across that
  // category's Country × Category cells, since the cap is set per cell.
  const capAcc = new Map<string, { cap: number[]; rec: number[] }>();
  for (const r of (data.bidCap ?? []) as BidCapRow[]) {
    const cat = r.category?.trim();
    if (!cat) continue;
    const e = capAcc.get(cat) ?? { cap: [], rec: [] };
    if (r.cpiActual > 0) e.cap.push(r.cpiActual);
    if (r.bidRecommended > 0) e.rec.push(r.bidRecommended);
    capAcc.set(cat, e);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

  const totalSpend = Array.from(acc.values()).reduce((s, e) => s + e.spend, 0);
  const rows: CategoryCpiRow[] = [];
  acc.forEach((e, category) => {
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
  };
}
