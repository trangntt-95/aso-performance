import type { KwAddedManualRow, MasterKwRow } from './types';
import { normKw } from './kwNorm';

export type PaidSource = 'master' | 'manual' | 'paused' | 'negative';

export interface PaidStatus {
  /** Actively bid (Master active camps or Manual). Paused/negatives are NOT inPaid. */
  inPaid: boolean;
  /** In the Negative KW list (explicitly excluded from paid). */
  negative: boolean;
  /** Previously bid, but every camp containing it is paused → effectively NOT bid.
   *  Shows up in "Not in Paid" so it can be re-considered when traffic returns. */
  paused: boolean;
  source: PaidSource | null;
  masterCamps?: string[];
  pausedCamps?: string[];
  manualCamp?: string;
  manualNote?: string;
}

export interface PaidStatusIndex {
  /** kw_lowercase → set of ACTIVE camp names (paused camps excluded). */
  master: Map<string, Set<string>>;
  /** kw_lowercase → manual row */
  manual: Map<string, KwAddedManualRow>;
  /** kw_lowercase → set of PAUSED camp names (from Paused_camp tab + any
   *  Master rows whose camp also appears in Paused_camp). */
  paused: Map<string, Set<string>>;
  /** kw_lowercase set from Negative KW list */
  negative: Set<string>;
}

/** Build a lookup index once per dataset to amortise the cost of resolving
 *  paid status across many keyword rows. */
export function buildPaidStatusIndex(
  masterKwLookup: MasterKwRow[],
  kwAddedManual: KwAddedManualRow[],
  negativeKw: string[] = [],
  pausedKw: MasterKwRow[] = [],
): PaidStatusIndex {
  // Camp-level pause: every camp name present in Paused_camp is dead, even if
  // its rows still linger in Master KW Lookup (verified live: 5 camps overlap).
  const pausedCampNames = new Set<string>();
  for (const r of pausedKw) {
    if (r.camp) pausedCampNames.add(r.camp);
  }

  const master = new Map<string, Set<string>>();
  const paused = new Map<string, Set<string>>();
  const addPaused = (kw: string, camp: string) => {
    const k = normKw(kw);
    if (!paused.has(k)) paused.set(k, new Set());
    if (camp) paused.get(k)!.add(camp);
  };

  for (const r of masterKwLookup) {
    if (r.camp && pausedCampNames.has(r.camp)) {
      addPaused(r.keyword, r.camp); // stale Master row of a paused camp
      continue;
    }
    const k = normKw(r.keyword);
    if (!master.has(k)) master.set(k, new Set());
    if (r.camp) master.get(k)!.add(r.camp);
  }
  for (const r of pausedKw) {
    addPaused(r.keyword, r.camp);
  }

  const manual = new Map<string, KwAddedManualRow>();
  for (const r of kwAddedManual) {
    manual.set(normKw(r.keyword), r);
  }
  const negative = new Set<string>();
  for (const kw of negativeKw) {
    negative.add(normKw(kw));
  }
  return { master, manual, paused, negative };
}

/** Resolve "In Paid" status for a single keyword. Precedence:
 *  master (active camps) > manual (freshly-added fallback) > paused > negative.
 *  A kw bid in one active camp AND paused in another counts as In Paid.
 *  Case- and whitespace-insensitive match (ASO tabs sometimes carry double spaces). */
export function resolvePaidStatus(
  keyword: string,
  index: PaidStatusIndex,
): PaidStatus {
  const k = normKw(keyword);
  const masterCamps = index.master.get(k);
  if (masterCamps && masterCamps.size > 0) {
    return {
      inPaid: true,
      negative: false,
      paused: false,
      source: 'master',
      masterCamps: Array.from(masterCamps),
    };
  }
  const manual = index.manual.get(k);
  if (manual) {
    return {
      inPaid: true,
      negative: false,
      paused: false,
      source: 'manual',
      manualCamp: manual.camp,
      manualNote: manual.note,
    };
  }
  // Only paused camps ever bid this kw → treat as NOT bid (re-consider it),
  // but keep the history visible via the paused flag/camps.
  const pausedCamps = index.paused.get(k);
  if (pausedCamps && pausedCamps.size > 0) {
    return {
      inPaid: false,
      negative: false,
      paused: true,
      source: 'paused',
      pausedCamps: Array.from(pausedCamps),
    };
  }
  // Negative list: not actively bid, but explicitly handled → not "Not in Paid".
  if (index.negative.has(k)) {
    return { inPaid: false, negative: true, paused: false, source: 'negative' };
  }
  return { inPaid: false, negative: false, paused: false, source: null };
}
