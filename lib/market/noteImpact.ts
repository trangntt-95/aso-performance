import type { HistoryDailyRow, MasterKwRow } from '@/lib/sheets/types';
import { normKw } from '@/lib/sheets/kwNorm';
import { normalizeCampName, buildCampNameResolver } from '@/lib/sheets/campName';
import { parseSheetDate } from '@/lib/utils/format';

// Measure the impact of a bid change AFTER you note it on an underbid keyword.
//
// The note carries a timestamp (App_Notes updatedAt). History_Daily carries the
// keyword's paid & organic users (usersL7D, 7-day rolling → a smooth curve) and
// paid position per day. So around the note date we can read a before/after:
// did raising the bid actually pull the keyword's PAID SHARE up (paid capturing
// the organic demand it was missing), improve its paid position, add paid users?
//
// We measure the OUTCOME (paid share / pos / users over time), not the bid value
// itself — the "$9" only lives in your free-text note. Correlation, not proof:
// the move could also come from competition or seasonality.

const DAY_MS = 86_400_000;

export interface ImpactPoint {
  /** ms epoch (UTC midnight of the snapshot day). */
  t: number;
  /** paid / (paid + organic) users; null when the day has no users at all. */
  paidShare: number | null;
  paidUsers: number | null;
  organicUsers: number | null;
  /** paid position (L7D); lower = better; null when not on paid. */
  paidPos: number | null;
}

export type ImpactStatus =
  | 'measured' // have a real post-note paid-share reading to compare
  | 'no-paid-yet' // enough time passed, but still no paid presence after the note
  | 'too-recent' // noted, but not enough days have passed yet
  | 'no-history'; // keyword has no History_Daily rows at all

export interface NoteImpact {
  /** Full paid-share timeline (sorted) for the chart / sparkline. */
  points: ImpactPoint[];
  /** ms epoch of the note. */
  noteAt: number;
  /** Baseline reading at/just before the note. */
  before: ImpactPoint | null;
  /** Reading ~afterDays after the note (nearest available). */
  after: ImpactPoint | null;
  /** Actual days between the two readings used (null when not measured). */
  spanDays: number | null;
  status: ImpactStatus;
}

// Merge one keyword's daily rows (both surfaces) into a paid-share timeline.
function pointsFromRows(rows: HistoryDailyRow[]): ImpactPoint[] {
  const byDay = new Map<number, ImpactPoint>();
  for (const r of rows) {
    const d = parseSheetDate(r.snapshotDate);
    if (!d) continue;
    const t = d.getTime();
    let p = byDay.get(t);
    if (!p) {
      p = { t, paidShare: null, paidUsers: null, organicUsers: null, paidPos: null };
      byDay.set(t, p);
    }
    if (r.surface === 'search_ad') {
      if (r.usersL7D != null) p.paidUsers = r.usersL7D;
      if (r.posL7D != null) p.paidPos = r.posL7D;
    } else if (r.usersL7D != null) {
      p.organicUsers = r.usersL7D;
    }
  }
  const pts = Array.from(byDay.values()).sort((a, b) => a.t - b.t);
  for (const p of pts) {
    const paid = p.paidUsers ?? 0;
    const org = p.organicUsers ?? 0;
    p.paidShare = paid + org > 0 ? paid / (paid + org) : null;
  }
  return pts;
}

/** Paid-share timeline for every keyword — one pass, for the underbid table. */
export function buildPaidShareIndex(historyDaily: HistoryDailyRow[]): Map<string, ImpactPoint[]> {
  const rowsByKw = new Map<string, HistoryDailyRow[]>();
  for (const r of historyDaily) {
    const k = normKw(r.searchTerm);
    const list = rowsByKw.get(k);
    if (list) list.push(r);
    else rowsByKw.set(k, [r]);
  }
  const out = new Map<string, ImpactPoint[]>();
  rowsByKw.forEach((rows, k) => out.set(k, pointsFromRows(rows)));
  return out;
}

// ---------------------------------------------------------------------------
// Camp-level impact (overbid table)
// ---------------------------------------------------------------------------
//
// An overbid camp's action is "hạ bid", but Shopify_daily is a single aggregate
// row per camp — there is NO daily cost series, so the CPC before/after can't be
// measured. What we CAN measure is the TRAFFIC the camp's keywords hold: sum the
// paid & organic users of every keyword bid by the camp (Master KW Lookup) per
// day. Lowering a bid that was too high should keep that paid share roughly flat
// (cheaper taps, same demand captured); a collapse means the cut went too deep.

/** Merge MANY keywords' daily rows into one timeline: users add up, and paid
 *  position becomes a users-weighted mean (a camp has no single position). */
function sumPointsFromRows(rows: HistoryDailyRow[]): ImpactPoint[] {
  const byDay = new Map<number, ImpactPoint>();
  const posAcc = new Map<number, { sum: number; w: number }>();
  for (const r of rows) {
    const d = parseSheetDate(r.snapshotDate);
    if (!d) continue;
    const t = d.getTime();
    let p = byDay.get(t);
    if (!p) {
      p = { t, paidShare: null, paidUsers: null, organicUsers: null, paidPos: null };
      byDay.set(t, p);
    }
    if (r.surface === 'search_ad') {
      if (r.usersL7D != null) p.paidUsers = (p.paidUsers ?? 0) + r.usersL7D;
      if (r.posL7D != null) {
        const w = r.usersL7D != null && r.usersL7D > 0 ? r.usersL7D : 1;
        const acc = posAcc.get(t) ?? { sum: 0, w: 0 };
        acc.sum += r.posL7D * w;
        acc.w += w;
        posAcc.set(t, acc);
      }
    } else if (r.usersL7D != null) {
      p.organicUsers = (p.organicUsers ?? 0) + r.usersL7D;
    }
  }
  const pts = Array.from(byDay.values()).sort((a, b) => a.t - b.t);
  for (const p of pts) {
    const paid = p.paidUsers ?? 0;
    const org = p.organicUsers ?? 0;
    p.paidShare = paid + org > 0 ? paid / (paid + org) : null;
    const acc = posAcc.get(p.t);
    if (acc && acc.w > 0) p.paidPos = acc.sum / acc.w;
  }
  return pts;
}

export interface CampImpactSeries {
  points: ImpactPoint[];
  /** Keywords the camp bids that actually have History_Daily rows. */
  keywords: number;
  /** Distinct keywords the camp bids (Master KW Lookup). */
  keywordsTotal: number;
}

export interface CampImpactIndex {
  /** Series for a camp name as it appears in Shopify_daily — the "(CPI 17)" /
   *  "- cân nhắc off" annotations Trang adds are tolerated on both sides. */
  get(camp: string): CampImpactSeries | undefined;
  /** How many camps got a timeline (empty when Master KW Lookup is missing). */
  size: number;
}

/** Paid-share timeline per CAMPAIGN — for the overbid table. */
export function buildCampPaidShareIndex(
  historyDaily: HistoryDailyRow[],
  masterKw: MasterKwRow[],
): CampImpactIndex {
  // camp base name (lowercased) -> its distinct keywords. Master KW Lookup lists
  // a keyword once per match type but the payload drops matchType, so the same
  // (camp, keyword) pair repeats — a Set keeps it from double-counting users.
  const kwByCamp = new Map<string, Set<string>>();
  const campNames = new Map<string, string>(); // lc -> canonical base name
  for (const r of masterKw) {
    if (!r.camp || !r.keyword) continue;
    const base = normalizeCampName(r.camp);
    if (!base) continue;
    const lc = base.toLowerCase();
    let set = kwByCamp.get(lc);
    if (!set) {
      set = new Set();
      kwByCamp.set(lc, set);
      campNames.set(lc, base);
    }
    set.add(normKw(r.keyword));
  }

  const rowsByKw = new Map<string, HistoryDailyRow[]>();
  for (const r of historyDaily) {
    const k = normKw(r.searchTerm);
    const list = rowsByKw.get(k);
    if (list) list.push(r);
    else rowsByKw.set(k, [r]);
  }

  const series = new Map<string, CampImpactSeries>();
  kwByCamp.forEach((kws, lc) => {
    const rows: HistoryDailyRow[] = [];
    let hit = 0;
    kws.forEach((k) => {
      const list = rowsByKw.get(k);
      if (!list) return;
      rows.push(...list);
      hit++;
    });
    if (rows.length === 0) return;
    series.set(lc, { points: sumPointsFromRows(rows), keywords: hit, keywordsTotal: kws.size });
  });

  const resolver = buildCampNameResolver(Array.from(campNames.values()));
  return {
    size: series.size,
    get(camp) {
      const direct = series.get(normalizeCampName(camp).toLowerCase());
      if (direct) return direct;
      const base = resolver.resolve(camp);
      return base ? series.get(base.toLowerCase()) : undefined;
    },
  };
}

/** Paid-share timeline for a single keyword — for the detail sheet. */
export function keywordPaidShare(historyDaily: HistoryDailyRow[], keyword: string): ImpactPoint[] {
  const target = normKw(keyword);
  return pointsFromRows(historyDaily.filter((r) => normKw(r.searchTerm) === target));
}

export interface ImpactOptions {
  /** Target days after the note to read the "after" value. Default 10. */
  afterDays?: number;
  /** Need at least this many days of post-note data to call it measured. Default 6. */
  minAfterDays?: number;
}

/** Compare paid metrics before vs ~afterDays after a note timestamp. */
export function summarizeImpact(
  points: ImpactPoint[] | undefined,
  noteAtMs: number,
  opts: ImpactOptions = {},
): NoteImpact {
  const afterDays = opts.afterDays ?? 10;
  const minAfterDays = opts.minAfterDays ?? 6;

  if (!points || points.length === 0) {
    return { points: points ?? [], noteAt: noteAtMs, before: null, after: null, spanDays: null, status: 'no-history' };
  }

  // A day only carries a meaningful paid share when it had users at all — days
  // with no users (paidShare null) are noise and never chosen as before/after.
  const hasShare = (p: ImpactPoint) => p.paidShare != null;

  // before = last real reading at/just before the note (1-day grace so a
  // same-day snapshot still counts as the baseline).
  let before: ImpactPoint | null = null;
  for (const p of points) {
    if (p.t > noteAtMs + DAY_MS) break;
    if (hasShare(p)) before = p;
  }

  // Has enough time even elapsed since the note to expect a reaction?
  const elapsed = points.some((p) => p.t >= noteAtMs + minAfterDays * DAY_MS);
  if (!elapsed) {
    return { points, noteAt: noteAtMs, before, after: null, spanDays: null, status: 'too-recent' };
  }

  // after = the real reading nearest to noteAt + afterDays, among points at
  // least minAfterDays past the note.
  const target = noteAtMs + afterDays * DAY_MS;
  let after: ImpactPoint | null = null;
  for (const p of points) {
    if (p.t < noteAtMs + minAfterDays * DAY_MS || !hasShare(p)) continue;
    if (after === null || Math.abs(p.t - target) < Math.abs(after.t - target)) after = p;
  }
  if (after === null) {
    // Time passed but no paid presence after the note — a real finding: the bid
    // change hasn't produced (or sustained) paid traffic yet.
    return { points, noteAt: noteAtMs, before, after: null, spanDays: null, status: 'no-paid-yet' };
  }

  const anchor = before ? before.t : noteAtMs;
  return { points, noteAt: noteAtMs, before, after, spanDays: Math.round((after.t - anchor) / DAY_MS), status: 'measured' };
}
