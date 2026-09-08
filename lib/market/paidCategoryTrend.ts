import type { PaidCategoryBoard } from '@/lib/sheets/types';

// The logic behind the Paid-theo-Category trend screen, ported one-for-one from
// Trang's own Apps Script dashboard (Code.gs v4 + Dashboard.html) so both read
// the same numbers and label them the same way.
//
// Kept in its own module, free of React, for two reasons: the factor search and
// the label de-collision are the parts that are easy to get subtly wrong, and
// they are the parts worth unit-testing against the sheet fixture.
//
// Every rule here mirrors a decision already made in that script. Where this file
// differs it is noted at the point of difference — there are two such places, and
// both are bugs the port surfaced rather than choices.

// ── Metric configuration. Structural only: no measured value appears here. ──

export type MetricFormat = 'n' | 'money' | 'pct';
export type AxisSide = 'L' | 'R';

export interface MetricCfg {
  /** 1 = Khối lượng, 2 = Hiệu quả & chi phí, 3 = Khác. */
  group: 1 | 2 | 3;
  /** Which axis this metric reads against in TOTAL mode. */
  axis: AxisSide;
  /** Pinned factor, used when auto-scaling is switched off. Multiplies the RAW
   *  value, and for a percent metric it already includes the ×100 that turns
   *  0.43 into 43 — which is why the legend divides it back out. */
  pinned: number;
  fmt: MetricFormat;
  /** Fixed per METRIC, never by position in a group: colour-by-position makes
   *  every remaining line change colour the moment one is switched off. */
  color: string;
  dash: string | undefined;
}

export const GROUP_NAMES: Record<number, string> = {
  1: 'Khối lượng',
  2: 'Hiệu quả & chi phí',
  3: 'Khác',
};

export const TOTAL_GROUP = 'total';
export const TOTAL_GROUP_LABEL = 'TOTAL — toàn bộ metric';

export const METRIC_CFG: Record<string, MetricCfg> = {
  Installs: { group: 1, axis: 'L', pinned: 10, fmt: 'n', color: '#2a78d6', dash: undefined },
  Clicks: { group: 1, axis: 'L', pinned: 1, fmt: 'n', color: '#1baf7a', dash: undefined },
  Impressions: { group: 1, axis: 'L', pinned: 0.01, fmt: 'n', color: '#6250d6', dash: undefined },
  Spend: { group: 1, axis: 'L', pinned: 1, fmt: 'money', color: '#008300', dash: undefined },
  CPI: { group: 2, axis: 'R', pinned: 10, fmt: 'money', color: '#eb6834', dash: '7 3' },
  CPC: { group: 2, axis: 'R', pinned: 100, fmt: 'money', color: '#eda100', dash: '7 3' },
  CR: { group: 2, axis: 'R', pinned: 1000, fmt: 'pct', color: '#e34948', dash: '7 3' },
  CTR: { group: 2, axis: 'R', pinned: 10000, fmt: 'pct', color: '#e87ba4', dash: '7 3' },
  Pos: { group: 2, axis: 'R', pinned: 100, fmt: 'n', color: '#898781', dash: '7 3' },
};

/** A metric the sheet has but the config doesn't. It still charts, on its own
 *  group, factor 1 — a new block must never break the screen. */
const FALLBACK: MetricCfg = {
  group: 3,
  axis: 'L',
  pinned: 1,
  fmt: 'n',
  color: '#57606a',
  dash: '2 3',
};

export const cfgOf = (metric: string): MetricCfg => METRIC_CFG[metric] ?? FALLBACK;

/** Shown on first open, per group. After that the user's toggles win. */
export const DEFAULT_ON: Record<string, string[]> = {
  '1': ['Installs', 'Clicks'],
  '2': ['CPI', 'CR', 'CPC'],
  total: ['Installs', 'CPI'],
};

/** Where the factor search aims to land the middle of the axis, so the numbers
 *  printed on it stay readable. */
const BAND = 150;
/** Two factor sets whose axis ratios are within this of each other count as
 *  equally good, and the readable one wins. */
const RATIO_TOLERANCE = 1.02;
/** Minimum vertical gap between end-of-line labels, in px. */
export const LABEL_GAP = 15;

export const AXIS_NAME: Record<AxisSide, string> = {
  L: 'Khối lượng',
  R: 'Hiệu quả & chi phí',
};

// ── Aggregation across categories ──
//
// Which route a metric takes is a correctness question, not a preference:
// counts sum, ratios are recomputed from the summed parts, and what has no
// summable parts gets a weighted mean. Summing a ratio, or averaging one
// plainly, both produce a number that looks fine and is wrong.

const SUMMABLE = ['Installs', 'Impressions', 'Clicks', 'Spend'];
const DERIVED: Record<string, { num: string; den: string; weight: string }> = {
  CPI: { num: 'Spend', den: 'Installs', weight: 'Installs' },
  CPC: { num: 'Spend', den: 'Clicks', weight: 'Clicks' },
  CR: { num: 'Installs', den: 'Clicks', weight: 'Clicks' },
  CTR: { num: 'Clicks', den: 'Impressions', weight: 'Impressions' },
};
const WEIGHTED: Record<string, string> = { Pos: 'Impressions' };

/**
 * Minimum share of a period's total weight that must actually carry a value
 * before a weighted result is reported. Below it, report nothing.
 *
 * Not a nicety. 'Test, others' is around 48% of impressions and its Pos is
 * missing at two periods in the older data; averaging the remaining 52% gave
 * 2.14 then 2.64, which reads as a dip and a spike and is really just half the
 * data missing. A hole beats a confident wrong number.
 */
const MIN_COVERAGE = 0.8;

export interface TrendCube {
  /** Period labels, oldest first. */
  periods: string[];
  metrics: string[];
  /** Categories, with the aggregate first when present. */
  categories: string[];
  /** metric → category → value per period, aligned to `periods`. */
  at: (metric: string, category: string, periodIndex: number) => number | null;
  totalLabel: string;
  /** Non-null cells, excluding the aggregate — a fast way to spot that something
   *  upstream broke. */
  dataPoints: number;
}

/**
 * Turn the parsed board into the cube the screen reads, adding the aggregate
 * category.
 *
 * The board arrives as metric tiers; the aggregate needs to look across tiers
 * (CPI wants Spend and Installs), so everything is indexed first.
 */
export function buildTrendCube(board: PaidCategoryBoard, totalLabel = 'TOTAL'): TrendCube {
  const periods = board.periodMonths.length === board.periods.length
    ? board.periodMonths
    : board.periods;
  const metrics = board.series.map((s) => s.metric);

  // metric → category → values
  const grid: Record<string, Record<string, (number | null)[]>> = {};
  const baseCats: string[] = [];
  for (const tier of board.series) {
    grid[tier.metric] = {};
    for (const row of tier.rows) {
      grid[tier.metric][row.category] = row.values.slice();
      if (!baseCats.includes(row.category)) baseCats.push(row.category);
    }
  }

  const get = (m: string, c: string, i: number): number | null => {
    const v = grid[m]?.[c]?.[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  const sumAt = (m: string, i: number): number | null => {
    let s = 0;
    let seen = false;
    for (const c of baseCats) {
      const v = get(m, c, i);
      if (v === null) continue;
      s += v;
      seen = true;
    }
    return seen ? s : null;
  };

  const wavgAt = (m: string, weightMetric: string, i: number): number | null => {
    let num = 0;
    let den = 0;
    let all = 0;
    for (const c of baseCats) {
      const w = get(weightMetric, c, i);
      if (w !== null) all += w;
      const v = get(m, c, i);
      if (v === null || w === null) continue;
      num += v * w;
      den += w;
    }
    if (!den || !all) return null;
    if (den / all < MIN_COVERAGE) return null;
    return num / den;
  };

  const n = periods.length;
  for (const m of metrics) {
    const vals: (number | null)[] = [];
    for (let i = 0; i < n; i++) {
      if (WEIGHTED[m]) {
        vals.push(wavgAt(m, WEIGHTED[m], i));
        continue;
      }
      const d = DERIVED[m];
      if (d) {
        const a = sumAt(d.num, i);
        const b = sumAt(d.den, i);
        // Parts unavailable — the older data has no Spend for the first periods,
        // so CPI cannot be derived there and the weighted mean is the only honest
        // answer. This fallback is load-bearing, not decoration.
        vals.push(a !== null && b ? a / b : wavgAt(m, d.weight, i));
        continue;
      }
      vals.push(sumAt(m, i));
    }
    grid[m][totalLabel] = vals;
  }
  void SUMMABLE; // declared for the reader; the default path already sums.

  let points = 0;
  for (const m of metrics) {
    for (const c of baseCats) {
      for (let i = 0; i < n; i++) if (get(m, c, i) !== null) points++;
    }
  }

  return {
    periods,
    metrics,
    categories: [totalLabel, ...baseCats],
    at: get,
    totalLabel,
    dataPoints: points,
  };
}

// ── Formatting ──

/** Value → text, in the metric's own unit. Matches Dashboard.html's fmt(). */
export function fmtValue(v: number | null | undefined, f: MetricFormat): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (f === 'pct') return `${Math.round(v * 1000) / 10}%`;
  const a = Math.abs(v);
  const s =
    a >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : a >= 10 ? v.toFixed(1)
        : v.toFixed(2);
  return (f === 'money' ? '$' : '') + s;
}

const trim3 = (x: number): number => Math.round(x * 1000) / 1000;
const ppOf = (metric: string): number => (cfgOf(metric).fmt === 'pct' ? 100 : 1);

/**
 * Legend text for a metric at a given factor.
 *
 * Written in the reader's units, not the raw factor. A percent metric's factor
 * already carries the ×100 that turns 0.43 into 43, so CR at a raw factor of
 * 1000 reads "CR (%) ×10" — printing ×1000 would claim the line sits a thousand
 * times above its value. At factor 1 nothing is appended and no "(%)" either,
 * because the axis is then showing the untouched number.
 */
export function legendLabel(metric: string, factor?: number): string {
  const c = cfgOf(metric);
  if (factor === undefined || factor === 1) return metric;
  const kd = factor / ppOf(metric);
  const suffix =
    Math.abs(kd - 1) < 1e-9 ? '' : kd > 1 ? ` ×${trim3(kd)}` : ` ÷${trim3(1 / kd)}`;
  return metric + (c.fmt === 'pct' ? ' (%)' : '') + suffix;
}

// ── Factor selection ──

function median(a: number[]): number | null {
  const s = a.slice().sort((x, y) => x - y);
  const n = s.length;
  if (!n) return null;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/**
 * Pick a factor per metric so several lines share one axis readably.
 *
 * Minimising the axis ratio alone is not enough. The smallest ratio is reached by
 * dividing Impressions by 100000 and Installs by 100 — which plots beautifully
 * and puts numbers on the axis that mean nothing. The geometric-mean tie-break is
 * what keeps the axis legible, so it is not optional.
 *
 * Factors are always powers of ten (times the percent adjustment), which is what
 * makes the legend readable at all.
 */
export function pickFactors(
  metrics: string[],
  series: (metric: string) => (number | null)[],
  auto: boolean,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!metrics.length) return out;
  if (metrics.length === 1) {
    // One line owns the axis: show it untouched, whatever its magnitude.
    out[metrics[0]] = 1;
    return out;
  }
  if (!auto) {
    for (const m of metrics) out[m] = cfgOf(m).pinned;
    return out;
  }

  const pts: Record<string, number[]> = {};
  const meds: Record<string, number | null> = {};
  for (const m of metrics) {
    const pp = ppOf(m);
    const v = series(m).filter((x): x is number => x !== null && x > 0);
    pts[m] = v;
    meds[m] = v.length ? median(v.map((x) => x * pp)) : null;
  }

  interface Cand { ratio: number; pen: number; ks: Record<string, number> }
  const cands: Cand[] = [];
  for (let e = 0; e <= 4.5 + 1e-9; e += 0.05) {
    const target = Math.pow(10, e);
    const ks: Record<string, number> = {};
    for (const m of metrics) {
      const pp = ppOf(m);
      const md = meds[m];
      ks[m] = md ? pp * Math.pow(10, Math.round(Math.log10(target / md))) : cfgOf(m).pinned;
    }
    let lo = Infinity;
    let hi = -Infinity;
    let logSum = 0;
    let n = 0;
    for (const m of metrics) {
      for (const v of pts[m]) {
        const x = v * ks[m];
        if (x <= 0) continue;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
        logSum += Math.log10(x);
        n++;
      }
    }
    if (!n || lo === Infinity) continue;
    const gm = Math.pow(10, logSum / n);
    cands.push({ ratio: hi / lo, pen: Math.abs(Math.log10(gm / BAND)), ks });
  }
  if (!cands.length) {
    for (const m of metrics) out[m] = cfgOf(m).pinned;
    return out;
  }

  let minRatio = Infinity;
  for (const c of cands) if (c.ratio < minRatio) minRatio = c.ratio;
  let pick: Cand | null = null;
  for (const c of cands) {
    if (c.ratio > minRatio * RATIO_TOLERANCE) continue;
    if (!pick || c.pen < pick.pen) pick = c;
  }
  return (pick ?? cands[0]).ks;
}

// ── End-of-line labels ──

/**
 * Spread label positions so they never overlap, then keep the run inside the
 * plot.
 *
 * The order is not interchangeable: sort, push down from the top, then shift the
 * whole block up if it overflows the bottom, then down if it overflows the top.
 * Clamping before spreading lets labels re-collide afterwards.
 *
 * Returns positions in the order given, not sorted order — the caller pairs them
 * back to its own list. Dashboard.html sorts in place and draws from the sorted
 * array, which works there only because it never needs the original order again.
 */
export function layoutEndLabels(
  ys: number[],
  top: number,
  bottom: number,
  gap = LABEL_GAP,
): number[] {
  const idx = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < idx.length; k++) {
    if (idx[k].y - idx[k - 1].y < gap) idx[k].y = idx[k - 1].y + gap;
  }
  if (idx.length) {
    const over = idx[idx.length - 1].y - bottom;
    if (over > 0) for (const o of idx) o.y -= over;
    const under = top - idx[0].y;
    if (under > 0) for (const o of idx) o.y += under;
  }
  const out: number[] = [];
  for (const o of idx) out[o.i] = o.y;
  return out;
}

/** Right-hand padding needed so the longest end label isn't clipped. */
export function endLabelPadding(names: string[]): number {
  let w = 0;
  for (const n of names) w = Math.max(w, n.length);
  return Math.min(160, w * 7 + 16);
}

/** Metrics of a group, in the order the sheet lists them. */
export function metricsOfGroup(metrics: string[], group: string): string[] {
  if (group === TOTAL_GROUP) return metrics.slice();
  const g = Number(group);
  return metrics.filter((m) => cfgOf(m).group === g);
}

/** Groups actually present in the data, ascending, then the TOTAL entry. */
export function groupsPresent(metrics: string[]): { id: string; label: string }[] {
  const gs: number[] = [];
  for (const m of metrics) {
    const g = cfgOf(m).group;
    if (!gs.includes(g)) gs.push(g);
  }
  gs.sort((a, b) => a - b);
  const out = gs.map((g) => ({
    id: String(g),
    label: `${GROUP_NAMES[g]} — ${metrics.filter((m) => cfgOf(m).group === g).length} metric`,
  }));
  out.push({ id: TOTAL_GROUP, label: TOTAL_GROUP_LABEL });
  return out;
}
