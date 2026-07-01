import type {
  CampLinkRow,
  KeywordRow,
  KwAddedManualRow,
  MasterKwRow,
  SnapshotRow,
} from '@/lib/sheets/types';
import { buildPaidStatusIndex, resolvePaidStatus } from '@/lib/sheets/paidStatus';
import { normKw } from '@/lib/sheets/kwNorm';

// Uncover UNDERBID keywords: terms with real long-term (L365) organic demand
// that ARE being bid in a paid campaign, yet barely show up in paid (low paid
// share vs organic) and/or sit at a weak paid position (> threshold). These are
// candidates to raise the bid on. Each row carries the camp(s) it's bid in + URL.

export interface UnderbidCamp {
  name: string;
  url?: string;
}

export interface UnderbidRow {
  term: string;
  category: string;
  organicUsers: number;
  paidUsers: number;
  /** paid / (organic + paid) — low means paid is under-represented. */
  paidShare: number;
  organicPos: number | null;
  /** Organic avg position over the recent L30 window (from All_L30). */
  organicPosL30: number | null;
  /** Organic conversion rate (getApp / users) — high CR = stronger paid potential. */
  organicCr: number | null;
  paidPos: number | null;
  /** Paid avg position over the recent L30 window (from All_L30). */
  paidPosL30: number | null;
  inPaidSource: 'master' | 'manual';
  camps: UnderbidCamp[];
  /** Priority = organic demand the paid side is missing. */
  score: number;
}

export interface UnderbidParams {
  minOrganicUsers?: number; // default 5
  maxPaidSharePct?: number; // default 30 (%)
  posThreshold?: number; // default 2.7
}

export function findUnderbidKeywords(
  allL365: SnapshotRow[],
  masterKwLookup: MasterKwRow[],
  kwAddedManual: KwAddedManualRow[],
  negativeKw: string[],
  pausedKw: MasterKwRow[],
  campLinks: CampLinkRow[],
  allL30: KeywordRow[],
  params: UnderbidParams = {},
): UnderbidRow[] {
  const minOrganic = params.minOrganicUsers ?? 5;
  const maxShare = (params.maxPaidSharePct ?? 30) / 100;
  const posTh = params.posThreshold ?? 2.7;

  const index = buildPaidStatusIndex(masterKwLookup, kwAddedManual, negativeKw, pausedKw);
  const campUrl = new Map<string, string>();
  for (const c of campLinks) {
    if (c.camp && c.url) campUrl.set(normKw(c.camp), c.url);
  }

  // Recent (L30) avg position per keyword, split organic vs paid — display only,
  // does NOT affect the underbid rules (those stay on L365). posL is the L30 col.
  const l30Pos = new Map<string, { organic: number | null; paid: number | null }>();
  for (const r of allL30) {
    const k = normKw(r.searchTerm);
    if (!l30Pos.has(k)) l30Pos.set(k, { organic: null, paid: null });
    const slot = l30Pos.get(k)!;
    if (r.surface === 'search_ad') slot.paid = r.posL;
    else slot.organic = r.posL;
  }

  // Group L365 by keyword → its organic + paid snapshot rows.
  interface Agg {
    term: string;
    category: string;
    organic?: SnapshotRow;
    paid?: SnapshotRow;
  }
  const byKw = new Map<string, Agg>();
  for (const r of allL365) {
    const k = normKw(r.searchTerm);
    if (!byKw.has(k)) byKw.set(k, { term: r.searchTerm, category: r.category });
    const a = byKw.get(k)!;
    if (r.surface === 'search_ad') {
      a.paid = r;
    } else {
      a.organic = r;
      // Prefer organic for the display label/category.
      a.term = r.searchTerm;
      a.category = r.category;
    }
  }

  const out: UnderbidRow[] = [];
  byKw.forEach((a) => {
    const status = resolvePaidStatus(a.term, index);
    if (!status.inPaid) return; // must already be bid

    const organicUsers = a.organic?.users ?? 0;
    const paidUsers = a.paid?.users ?? 0;
    if (organicUsers < minOrganic) return; // need real organic demand

    const totalUsers = organicUsers + paidUsers;
    const paidShare = totalUsers > 0 ? paidUsers / totalUsers : 0;
    if (paidShare >= maxShare) return; // paid already well-represented

    const paidPos = a.paid?.pos ?? null;
    const weakPaidPos = paidPos == null || paidPos > posTh;
    if (!weakPaidPos) return; // paid already ranks at/above threshold

    const campNames =
      status.source === 'manual'
        ? status.manualCamp
          ? [status.manualCamp]
          : []
        : status.masterCamps ?? [];
    const camps: UnderbidCamp[] = campNames.map((name) => ({
      name,
      url: campUrl.get(normKw(name)),
    }));

    const l30 = l30Pos.get(normKw(a.term));

    out.push({
      term: a.term,
      category: a.category,
      organicUsers,
      paidUsers,
      paidShare,
      organicPos: a.organic?.pos ?? null,
      organicPosL30: l30?.organic ?? null,
      organicCr: a.organic?.cr ?? null,
      paidPos,
      paidPosL30: l30?.paid ?? null,
      inPaidSource: status.source === 'manual' ? 'manual' : 'master',
      camps,
      score: organicUsers * (1 - paidShare),
    });
  });

  out.sort((x, y) => y.score - x.score);
  return out;
}
