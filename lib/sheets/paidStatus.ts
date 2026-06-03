import type { KwAddedManualRow, MasterKwRow } from './types';

export type PaidSource = 'master' | 'manual' | 'negative';

export interface PaidStatus {
  /** Actively bid (Master or Manual). Negatives are NOT inPaid. */
  inPaid: boolean;
  /** In the Negative KW list (explicitly excluded from paid). */
  negative: boolean;
  source: PaidSource | null;
  masterCamps?: string[];
  manualCamp?: string;
  manualNote?: string;
}

export interface PaidStatusIndex {
  /** kw_lowercase → set of camp names from Master KW Lookup */
  master: Map<string, Set<string>>;
  /** kw_lowercase → manual row */
  manual: Map<string, KwAddedManualRow>;
  /** kw_lowercase set from Negative KW list */
  negative: Set<string>;
}

/** Build a lookup index once per dataset to amortise the cost of resolving
 *  paid status across many keyword rows. */
export function buildPaidStatusIndex(
  masterKwLookup: MasterKwRow[],
  kwAddedManual: KwAddedManualRow[],
  negativeKw: string[] = [],
): PaidStatusIndex {
  const master = new Map<string, Set<string>>();
  for (const r of masterKwLookup) {
    const k = r.keyword.toLowerCase();
    if (!master.has(k)) master.set(k, new Set());
    if (r.camp) master.get(k)!.add(r.camp);
  }
  const manual = new Map<string, KwAddedManualRow>();
  for (const r of kwAddedManual) {
    manual.set(r.keyword.toLowerCase(), r);
  }
  const negative = new Set<string>();
  for (const kw of negativeKw) {
    negative.add(kw.toLowerCase());
  }
  return { master, manual, negative };
}

/** Resolve "In Paid" status for a single keyword. Master takes precedence over
 *  manual (master = source of truth from campaign data; manual = freshly-added
 *  fallback for kws not yet pulled into Master). Case-insensitive match. */
export function resolvePaidStatus(
  keyword: string,
  index: PaidStatusIndex,
): PaidStatus {
  const k = keyword.toLowerCase();
  const masterCamps = index.master.get(k);
  if (masterCamps && masterCamps.size > 0) {
    return {
      inPaid: true,
      negative: false,
      source: 'master',
      masterCamps: Array.from(masterCamps),
    };
  }
  const manual = index.manual.get(k);
  if (manual) {
    return {
      inPaid: true,
      negative: false,
      source: 'manual',
      manualCamp: manual.camp,
      manualNote: manual.note,
    };
  }
  // Negative list: not actively bid, but explicitly handled → not "Not in Paid".
  if (index.negative.has(k)) {
    return { inPaid: false, negative: true, source: 'negative' };
  }
  return { inPaid: false, negative: false, source: null };
}
