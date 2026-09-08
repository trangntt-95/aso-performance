import type {
  PaidCategoryBoard,
  PaidCategorySeries,
  PaidCategorySnapshot,
} from './types';

// Parse the 'By categories' pivot of the Shopify Ads spreadsheet.
//
// This tab is a dashboard Trang built by hand. Everything here READS it; nothing
// recomputes it. Recomputing from the per-day rows would produce a second set of
// numbers that disagrees with her sheet in small ways — the app's per-day feed is
// filtered to campaigns still present in the main sheet, so it already reports
// $3,088 for August where the pivot says $3,154 — and then nobody could say which
// figure was right. Reading keeps one answer.
//
// ── Layout, verified live 2026-09-08 ──────────────────────────────────────
//   A1                'Date range' + two Excel serials (2026-08-01 → 2026-08-31)
//   A7:J15            LEFT block, snapshot of that window, one row per category
//   K..T, stacked     RIGHT block, nine metric tiers down the sheet; each tier is
//                     a label in column L, a 't1…t8 | % growth' header, then one
//                     row per category, then an unlabelled totals row
//
// Nothing is addressed by fixed row number. Tiers are located by their label and
// each tier reads forward until the rows stop looking like categories, so a row
// inserted above the block shifts nothing. The earlier version of this file did
// hardcode rows 8–15 and 102–109; that survives exactly one edit to the sheet.
//
// The two blocks agree where they overlap: the LEFT block's installs equal the
// INSTALLS tier's t8 for all eight categories (checked live), which is what
// establishes that t8 is the A1 window. t1–t7 carry no dates anywhere in the tab,
// and the app's per-day feed cannot recover them (it is filtered to live camps,
// so it undercounts older months), so they are carried as t1…t7 and nothing here
// pretends to know which months they are.

/**
 * Excel serial or ISO string → 'YYYY-MM-DD', or '' when unreadable.
 *
 * The serial arrives as a number from the Sheets API but as a numeric STRING
 * through anything that has been JSON round-tripped, so both are accepted. A
 * number-only check silently produced an empty date range.
 */
function toIso(v: unknown): string {
  const raw = String(v ?? '').trim();
  const n = typeof v === 'number' ? v : /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 20000 && n < 90000) {
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return m ? m[0] : '';
}

const text = (v: unknown): string => String(v ?? '').trim();

/** A number, or null for a blank cell — blank is the sheet declining to divide,
 *  which is different from a real zero and must not be flattened into one. */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[$,%\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const num = (v: unknown): number => numOrNull(v) ?? 0;

// Column indexes of the two blocks. These are the sheet's own layout, not row
// positions, and they only change if Trang restructures the pivot itself.
const LEFT = {
  category: 0, // A
  installs: 1,
  spend: 2,
  cpi: 3,
  clicks: 4,
  impressions: 5,
  cr: 6,
  cpc: 7,
  ctr: 8,
  position: 9, // J
};
const RIGHT = {
  label: 11, // L — where a tier announces itself
  category: 10, // K
  firstPeriod: 11, // L..S
  periodCount: 8,
  growth: 19, // T
};

/** Does this row name a category rather than being a header, a total, or blank? */
const isCategoryRow = (cell: unknown): boolean => {
  const t = text(cell);
  if (!t) return false;
  if (/^total$/i.test(t)) return false;
  // Tier headers sit in column L, so a 't1' landing in the category column would
  // mean the block has shifted; treat it as "not a category" and stop.
  return !/^t\d+$/i.test(t);
};

function snapshotFrom(row: unknown[], category: string): PaidCategorySnapshot {
  return {
    category,
    installs: num(row[LEFT.installs]),
    spend: num(row[LEFT.spend]),
    cpi: numOrNull(row[LEFT.cpi]),
    clicks: num(row[LEFT.clicks]),
    impressions: num(row[LEFT.impressions]),
    cr: numOrNull(row[LEFT.cr]),
    cpc: numOrNull(row[LEFT.cpc]),
    ctr: numOrNull(row[LEFT.ctr]),
    position: numOrNull(row[LEFT.position]),
  };
}

export function parsePaidCategoryBoard(rows: unknown[][]): PaidCategoryBoard | null {
  if (!rows || rows.length === 0) return null;

  // ── A1: the window the snapshot covers ──
  const head = rows[0] ?? [];
  const from = toIso(head[1]);
  const to = toIso(head[2]);

  // ── LEFT block: find the header row by its own column names, then read down ──
  let leftHeader = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = (rows[i] ?? []).map((c) => text(c).toLowerCase());
    if (r[LEFT.installs] === 'installs' && r[LEFT.spend] === 'spend') {
      leftHeader = i;
      break;
    }
  }
  const snapshot: PaidCategorySnapshot[] = [];
  let snapshotTotal: PaidCategorySnapshot | null = null;
  if (leftHeader >= 0) {
    // The TOTAL line is not adjacent to the categories — the right-hand block's
    // own totals row and a spacer sit between them in column A's rows. So gaps
    // are skipped rather than treated as the end of the block; only running out
    // of the search window stops the scan.
    const stopAt = Math.min(rows.length, leftHeader + 25);
    for (let i = leftHeader + 1; i < stopAt; i++) {
      const row = rows[i] ?? [];
      const name = text(row[LEFT.category]);
      if (!name) continue;
      if (/^total$/i.test(name)) {
        snapshotTotal = snapshotFrom(row, 'TOTAL');
        break;
      }
      snapshot.push(snapshotFrom(row, name));
    }
  }

  // ── RIGHT block: every tier, located by its label in column L ──
  //
  // A tier is recognised by the row AFTER its label being the t1…t8 header. That
  // two-row check is what stops a stray word in column L from being read as a
  // metric with garbage rows under it.
  const series: PaidCategorySeries[] = [];
  let periods: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const label = text((rows[i] ?? [])[RIGHT.label]);
    if (!label) continue;
    const next = (rows[i + 1] ?? []).map((c) => text(c).toLowerCase());
    if (next[RIGHT.firstPeriod] !== 't1') continue;

    if (periods.length === 0) {
      periods = Array.from({ length: RIGHT.periodCount }, (_, k) =>
        text((rows[i + 1] ?? [])[RIGHT.firstPeriod + k]) || `t${k + 1}`,
      );
    }

    const tier: PaidCategorySeries = {
      metric: label,
      rows: [],
      totals: [],
      totalsGrowth: null,
    };
    let j = i + 2;
    let blanks = 0;
    for (; j < rows.length; j++) {
      const row = rows[j] ?? [];
      const name = text(row[RIGHT.category]);
      const vals = Array.from({ length: RIGHT.periodCount }, (_, k) =>
        numOrNull(row[RIGHT.firstPeriod + k]),
      );
      if (isCategoryRow(name)) {
        tier.rows.push({
          category: name,
          values: vals,
          growth: numOrNull(row[RIGHT.growth]),
        });
        continue;
      }
      // Past the categories. An unnamed row carrying numbers is this tier's
      // totals line — directly below the last category for some tiers, one blank
      // row further down for others (Spend), so a gap is stepped over rather than
      // ending the tier. Rate tiers (CR, CPI, CPC, Pos, CTR) legitimately have no
      // totals: a rate cannot be summed and the sheet is right not to try.
      //
      // A tier LABEL row can never be mistaken for a totals row even though both
      // sit in column L, because a label is text — so none of L…S parses as a
      // number. Testing for a following tier explicitly is what broke this: on the
      // totals row column L holds a number, which read as a label and cut the
      // tier short.
      if (!name && vals.some((v) => v !== null)) {
        tier.totals = vals;
        tier.totalsGrowth = numOrNull(row[RIGHT.growth]);
        break;
      }
      // Blank. Allow one, since that is what separates Spend's categories from
      // its totals; a second means the tier really is over.
      blanks++;
      if (blanks > 1) break;
    }
    if (tier.rows.length > 0) series.push(tier);
    // Resume from where this tier ended, not from a count of its rows — blank
    // rows and a totals line make those two numbers differ. Minus one because the
    // outer loop's i++ runs next: landing ON j would skip it, and j is where the
    // NEXT tier's label sits when a tier ends without totals (CR, Pos), which
    // silently dropped CPI, Pos and Spend from the output.
    i = Math.max(i, j - 1);
  }

  if (snapshot.length === 0 && series.length === 0) return null;
  return {
    from,
    to,
    periods: periods.length ? periods : Array.from({ length: 8 }, (_, k) => `t${k + 1}`),
    snapshot,
    snapshotTotal,
    series,
  };
}
