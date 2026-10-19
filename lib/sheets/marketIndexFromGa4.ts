import type {
  DynamicBasketItem,
  ExecutiveSummary,
  FunnelBreakdown,
  KeywordRow,
  MarketIndexData,
  MarketIndexSummaryRow,
  Verdict,
  Window,
  WowMetric,
} from './types';

// Market_Index dựng lại từ tab GA4 window (GA4_All_L*_auto), thay tab
// Market_Index của Apps Script (Trang 19/10/2026: "thay hết để không phụ thuộc
// Apps Script"). Logic tự định nghĩa, không phải port Code.gs:
//
// - Total      = mọi keyword, cả organic lẫn paid, trong tab All_L{W}.
// - Basket     = 10 keyword nhiều users nhất ở L90 (organic + paid), trừ Noise.
//                Đây là "core market": nhu cầu lõi của app, ít nhiễu bởi term lẻ.
// - Weighted   = Σ users_keyword × share_L90 của keyword trong basket, tức chỉ
//                số nhu cầu lõi có trọng số theo độ lớn keyword (trueprofit,
//                profit nặng hơn term đuôi). deltaWeightedPct = L/P − 1.
// - Verdict    theo deltaWeightedPct: ≤ −20% DOWN · ≤ −5% SOFT DECLINE ·
//                ≥ +20% UP · ≥ +5% SOFT GROWTH · còn lại STABLE (cùng ngưỡng
//                ±5% với composeVerdict ở lib/utils/format.ts).
// - Divergence so basket với total; primaryCause tách organic / paid.

const WINDOWS: Window[] = ['L3', 'L7', 'L14', 'L30', 'L90'];
const BASKET_SIZE = 10;

export interface MarketIndexInput {
  allL3: KeywordRow[];
  allL7: KeywordRow[];
  allL14: KeywordRow[];
  allL30: KeywordRow[];
  allL90: KeywordRow[];
}

const norm = (s: string) => s.toLowerCase().trim();
const isPaid = (r: KeywordRow) => r.surface === 'search_ad';
const r1 = (v: number) => Math.round(v * 10) / 10;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
/** Δ% dạng phân số; kỳ trước 0 → +100% nếu kỳ này có, không thì 0. */
const delta = (cur: number, prev: number): number => (prev > 0 ? r4((cur - prev) / prev) : cur > 0 ? 1 : 0);
const pctText = (d: number) => `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`;

interface Tot { users: number; usersP: number; getApp: number; getAppP: number; posW: number; posN: number; posWP: number; posNP: number }
const emptyTot = (): Tot => ({ users: 0, usersP: 0, getApp: 0, getAppP: 0, posW: 0, posN: 0, posWP: 0, posNP: 0 });
function add(t: Tot, r: KeywordRow) {
  t.users += r.usersL; t.usersP += r.usersP; t.getApp += r.getAppL; t.getAppP += r.getAppP;
  if (r.posL !== null && r.usersL > 0) { t.posW += r.posL * r.usersL; t.posN += r.usersL; }
  if (r.posP !== null && r.usersP > 0) { t.posWP += r.posP * r.usersP; t.posNP += r.usersP; }
}
const metricsL = (t: Tot) => ({ users: t.users, getapp: t.getApp, cr: t.users > 0 ? r4(t.getApp / t.users) : 0, pos: t.posN > 0 ? r1(t.posW / t.posN) : null });
const metricsP = (t: Tot) => ({ users: t.usersP, getapp: t.getAppP, cr: t.usersP > 0 ? r4(t.getAppP / t.usersP) : 0, pos: t.posNP > 0 ? r1(t.posWP / t.posNP) : null });

function verdictOf(d: number): Verdict {
  if (d <= -0.2) return '📉 MARKET DOWN';
  if (d <= -0.05) return '⚠️ SOFT DECLINE';
  if (d >= 0.2) return '🚀 MARKET UP';
  if (d >= 0.05) return '📈 SOFT GROWTH';
  return '→ STABLE';
}

function divergenceOf(basket: number, total: number): string {
  if (basket >= 0.05 && total <= -0.05) return '⚠️ Basket healthy but tail leaking';
  if (basket <= -0.05 && total >= 0.05) return '⚠️ Tail growing, core basket soft';
  if (Math.abs(basket - total) >= 0.25) return `⚠️ Magnitude divergence (basket ${pctText(basket)} vs total ${pctText(total)})`;
  return '✅ Consistent';
}

function causeOf(org: Tot, paid: Tot): { primaryCause: string; causeDetails: string } {
  const dO = delta(org.users, org.usersP);
  const dP = delta(paid.users, paid.usersP);
  const orgTxt = `organic ${org.usersP}→${org.users} (${pctText(dO)})`;
  const paidTxt = `paid ${paid.usersP}→${paid.users} (${pctText(dP)})`;
  const orgStable = Math.abs(dO) < 0.1;
  const paidStable = Math.abs(dP) < 0.15;
  if (dO <= -0.1 && dP <= -0.15) return { primaryCause: 'Demand drop (both channels)', causeDetails: `Cả 2 channel cùng giảm: ${orgTxt}, ${paidTxt}` };
  if (dP <= -0.15 && dO > -0.1) return { primaryCause: 'Paid drop (bid/competitor outbid)', causeDetails: `${paidTxt}, organic ${orgStable ? 'stable' : pctText(dO)}` };
  if (dO <= -0.1) return { primaryCause: 'Organic drop (discoverability/pos)', causeDetails: `${orgTxt}, paid ${paidStable ? 'stable' : pctText(dP)}` };
  if (dO >= 0.1 && dP >= 0.15) return { primaryCause: 'Demand up (both channels)', causeDetails: `Cả 2 channel cùng tăng: ${orgTxt}, ${paidTxt}` };
  if (dO >= 0.1) return { primaryCause: 'Organic growth (discoverability/pos)', causeDetails: `${orgTxt}, paid ${paidStable ? 'stable' : pctText(dP)}` };
  if (dP >= 0.15) return { primaryCause: 'Paid growth (bid/impression share)', causeDetails: `${paidTxt}, organic ${orgStable ? 'stable' : pctText(dO)}` };
  return { primaryCause: 'Stable (no dominant driver)', causeDetails: `${orgTxt}, ${paidTxt}` };
}

function wowStatus(d: number): string {
  if (d <= -0.1) return '🚨 WORSENED';
  if (d >= 0.1) return '✅ IMPROVED';
  return '→ FLAT';
}

/** Basket = top N keyword theo users L90 (organic + paid), bỏ Noise. */
export function basketFromL90(allL90: KeywordRow[], size = BASKET_SIZE): DynamicBasketItem[] {
  const byTerm = new Map<string, { term: string; users: number }>();
  for (const r of allL90) {
    if (r.category === 'Noise') continue;
    const k = norm(r.searchTerm);
    const e = byTerm.get(k) ?? { term: r.searchTerm, users: 0 };
    e.users += r.usersL;
    byTerm.set(k, e);
  }
  return Array.from(byTerm.values())
    .filter((e) => e.users > 0)
    .sort((a, b) => b.users - a.users || a.term.localeCompare(b.term))
    .slice(0, size)
    .map((e, i) => ({ rank: i + 1, searchTerm: e.term, l90Users: e.users }));
}

export function marketIndexFromGa4(input: MarketIndexInput): MarketIndexData {
  const basket = basketFromL90(input.allL90);
  const basketTotal = basket.reduce((s, b) => s + b.l90Users, 0);
  const share = new Map<string, number>();
  for (const b of basket) share.set(norm(b.searchTerm), basketTotal > 0 ? b.l90Users / basketTotal : 0);

  const summary: MarketIndexSummaryRow[] = [];
  const funnels: FunnelBreakdown[] = [];
  const narratives: Partial<Record<Window, string>> = {};
  const wow: WowMetric[] = [];

  for (const w of WINDOWS) {
    const rows = input[`all${w}` as keyof MarketIndexInput] ?? [];
    if (rows.length === 0) continue;
    const total = emptyTot(), org = emptyTot(), paid = emptyTot(), bk = emptyTot();
    let weightedL = 0, weightedP = 0;
    for (const r of rows) {
      add(total, r);
      add(isPaid(r) ? paid : org, r);
      const s = share.get(norm(r.searchTerm));
      if (s !== undefined) {
        add(bk, r);
        weightedL += r.usersL * s;
        weightedP += r.usersP * s;
      }
    }
    const deltaWeightedPct = delta(weightedL, weightedP);
    const deltaTotalUsersPct = delta(total.users, total.usersP);
    const cause = causeOf(org, paid);
    summary.push({
      window: w,
      basketUsersL: bk.users,
      basketUsersP: bk.usersP,
      deltaUsersPct: delta(bk.users, bk.usersP),
      basketGetAppL: bk.getApp,
      basketGetAppP: bk.getAppP,
      deltaGetAppPct: delta(bk.getApp, bk.getAppP),
      weightedL: r1(weightedL),
      weightedP: r1(weightedP),
      deltaWeightedPct,
      totalUsersL: total.users,
      totalUsersP: total.usersP,
      deltaTotalUsersPct,
      totalGetAppL: total.getApp,
      totalGetAppP: total.getAppP,
      deltaTotalGetAppPct: delta(total.getApp, total.getAppP),
      verdict: verdictOf(deltaWeightedPct),
      divergence: divergenceOf(deltaWeightedPct, deltaTotalUsersPct),
      primaryCause: cause.primaryCause,
      causeDetails: cause.causeDetails,
    });
    funnels.push({
      window: w,
      organic: { L: metricsL(org), P: metricsP(org) },
      paid: { L: metricsL(paid), P: metricsP(paid) },
      total: { L: { users: total.users, getapp: total.getApp }, P: { users: total.usersP, getapp: total.getAppP } },
    });
    narratives[w] =
      `${w}: Users tổng ${total.usersP}→${total.users} (${pctText(deltaTotalUsersPct)}), GetApp ${total.getAppP}→${total.getApp} ` +
      `(${pctText(delta(total.getApp, total.getAppP))}). Core basket (top ${basket.length} keyword L90) ${pctText(deltaWeightedPct)}. ` +
      `Nguyên nhân chính: ${cause.primaryCause}. ${cause.causeDetails}.`;
    if (w === 'L7') {
      const push = (metric: string, cur: number, prev: number) =>
        wow.push({ metric, thisPeriod: cur, lastPeriod: prev, deltaValue: cur - prev, deltaPct: delta(cur, prev), status: wowStatus(delta(cur, prev)) });
      push('Total Install (L7)', total.getApp, total.getAppP);
      push('Total Users (L7)', total.users, total.usersP);
      push('Organic Users (L7)', org.users, org.usersP);
      push('Paid Users (L7)', paid.users, paid.usersP);
    }
  }

  const byW = new Map(summary.map((s) => [s.window, s]));
  const mid = ['L7', 'L14', 'L30'].map((w) => byW.get(w as Window)?.deltaWeightedPct).filter((d): d is number => d !== undefined);
  let overall: ExecutiveSummary['overallHealth'];
  if (mid.length === 3 && mid.every((d) => d <= -0.05)) overall = { value: 'PERSISTENT_DOWN', visual: '🚨 PERSISTENT TREND DOWN — urgent', status: 'CRITICAL' };
  else if (mid.length === 3 && mid.every((d) => d >= 0.05)) overall = { value: 'PERSISTENT_UP', visual: '🚀 PERSISTENT TREND UP', status: 'GOOD' };
  else if ((byW.get('L7')?.deltaWeightedPct ?? 0) <= -0.05) overall = { value: 'SHORT_TERM_DOWN', visual: '⚠️ L7 core basket down', status: 'WARNING' };
  else overall = { value: 'STABLE', visual: '→ STABLE', status: 'OK' };
  const l7 = byW.get('L7');
  const executiveSummary: ExecutiveSummary = {
    overallHealth: overall,
    trendSparkline: summary.map((s) => `${s.window}:${pctText(s.deltaWeightedPct)}`).join(' '),
    topConcern: l7 ? { value: `${l7.primaryCause} — ${l7.causeDetails}`, status: l7.deltaWeightedPct <= -0.2 ? 'HIGH' : l7.deltaWeightedPct <= -0.05 ? 'MEDIUM' : 'LOW' } : undefined,
    installPerDayL7: l7 ? Math.round((l7.totalGetAppL / 7) * 100) / 100 : undefined,
  };

  return { summary, funnels, narratives, executiveSummary, wow, basket };
}
