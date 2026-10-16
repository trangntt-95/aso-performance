import type { GoogleAdsPayload } from '@/lib/sheets/googleAdsTypes';
import type { SheetPayload } from '@/lib/sheets/types';
import { toUsd } from '@/lib/config/fx';
import { ADS_MONTHLY_TARGETS, expectedAdsInstallsForRange, runrateAdsForRange, GOOGLE_ADS_CPI_LIMIT_USD } from '@/lib/config/ads-targets';
import { isInstallAction } from './googleAdsReport';
import { daysInRange, previousRange, type DateRange } from './googleAdsFilter';

// "Pulse" của tab Google Ads — trả lời bốn câu Trang hỏi (15/10/2026) trên khoảng
// ngày đang lọc, không cần đọc bảng chi tiết:
//   1. CPI đã vượt $32 chưa
//   2. target install tháng đạt bao nhiêu %
//   3. so với kỳ liền trước (cùng độ dài) install / CPI tăng hay giảm
//   4. tăng/giảm chủ yếu do đâu — theo metric (traffic · CTR · CR), nước,
//      campaign, keyword
//
// Install = hành động install thật (isInstallAction), không phải "conversions".
// Install chỉ có theo campaign × ngày, nên khi chia theo nước / keyword thì chia
// install của campaign-ngày đó theo tỷ lệ conversions (không có thì theo click)
// của nước / keyword trong campaign-ngày đó. Là ước tính, UI nói rõ.
//
// Tiền quy ra USD (lib/config/fx) để so với trần $32 và với kênh App Store.

export interface PulseTotals {
  impressions: number;
  clicks: number;
  costUsd: number;
  installs: number;
  ctr: number | null;
  /** install ÷ click. */
  cr: number | null;
  cpcUsd: number | null;
  cpiUsd: number | null;
}

export interface PulseEntityRow {
  name: string;
  cur: PulseTotals;
  prev: PulseTotals;
  /** install kỳ này − kỳ trước. */
  dInstalls: number;
  /** Phần của dòng này trong thay đổi CPI toàn kênh (USD); cộng mọi dòng = ΔCPI.
   *  = (Δcost − CPI_prev × Δinstall) ÷ install_cur. Null khi kỳ này 0 install. */
  cpiContribUsd: number | null;
}

export interface GoogleAdsPulse {
  cur: DateRange;
  prev: DateRange;
  days: number;
  totals: { cur: PulseTotals; prev: PulseTotals };
  cpi: { limitUsd: number; cur: number | null; prev: number | null; over: boolean | null; deltaPct: number | null };
  target: {
    monthKey: string;
    monthFrom: string;
    monthTo: string;
    monthlyTarget: number | null;
    /** Target cộng dồn tới ngày cuối có data (pro-rate theo ngày). */
    expectedToDate: number | null;
    googleInstalls: number;
    /** Install App Store Ads cùng khoảng từ export Shopify; null khi không có export. */
    shopifyInstalls: number | null;
    /** Ngày cuối export Shopify Ads có trong khoảng — lệch với Google thì UI nói. */
    shopifyTo: string | null;
    paidInstalls: number;
    pct: number | null;
    runrate: { projected: number; pct: number } | null;
    googleShare: number | null;
  };
  installDrivers: { traffic: number; ctr: number; cr: number; total: number };
  cpiDrivers: { cpc: number; cr: number; total: number } | null;
  byCountry: PulseEntityRow[];
  byCampaign: PulseEntityRow[];
  byKeyword: PulseEntityRow[];
}

interface Acc { impressions: number; clicks: number; cost: number; installs: number }
const acc = (): Acc => ({ impressions: 0, clicks: 0, cost: 0, installs: 0 });
const within = (d: string, r: DateRange) => d >= r.from && d <= r.to;
const CK = '\u0000';

function finish(a: Acc, cur: string): PulseTotals {
  const costUsd = toUsd(a.cost, cur) ?? 0;
  return {
    impressions: a.impressions,
    clicks: a.clicks,
    costUsd,
    installs: a.installs,
    ctr: a.impressions > 0 ? a.clicks / a.impressions : null,
    cr: a.clicks > 0 ? a.installs / a.clicks : null,
    cpcUsd: a.clicks > 0 ? costUsd / a.clicks : null,
    cpiUsd: a.installs > 0 ? costUsd / a.installs : null,
  };
}

/** Chia install của campaign-ngày cho các dòng con theo tỷ lệ conversions, không có thì theo click. */
function allocate<T extends { date: string; campaignName: string; conversions: number; clicks: number; cost: number; impressions: number }>(
  rows: T[],
  installsByCampDay: Map<string, number>,
  keyOf: (r: T) => string,
  range: DateRange,
  into: Map<string, Acc>,
) {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    if (!within(r.date, range)) continue;
    const k = `${r.campaignName}${CK}${r.date}`;
    const g = groups.get(k);
    if (g) g.push(r); else groups.set(k, [r]);
  }
  groups.forEach((g, k) => {
    const inst = installsByCampDay.get(k) ?? 0;
    let convSum = 0, clickSum = 0;
    for (const r of g) { convSum += r.conversions; clickSum += r.clicks; }
    for (const r of g) {
      const key = keyOf(r);
      const e = into.get(key) ?? acc();
      e.impressions += r.impressions; e.clicks += r.clicks; e.cost += r.cost;
      const w = convSum > 0 ? r.conversions / convSum : clickSum > 0 ? r.clicks / clickSum : 0;
      e.installs += inst * w;
      into.set(key, e);
    }
  });
}

function entityRows(curMap: Map<string, Acc>, prevMap: Map<string, Acc>, cur: string, cpiPrev: number | null, installsCur: number): PulseEntityRow[] {
  const names = new Set<string>();
  curMap.forEach((_, k) => names.add(k));
  prevMap.forEach((_, k) => names.add(k));
  const rows: PulseEntityRow[] = [];
  names.forEach((name) => {
    const c = finish(curMap.get(name) ?? acc(), cur);
    const p = finish(prevMap.get(name) ?? acc(), cur);
    if (c.costUsd === 0 && p.costUsd === 0 && c.installs === 0 && p.installs === 0) return;
    const contrib = cpiPrev !== null && installsCur > 0 ? (c.costUsd - p.costUsd - cpiPrev * (c.installs - p.installs)) / installsCur : null;
    rows.push({ name, cur: c, prev: p, dInstalls: c.installs - p.installs, cpiContribUsd: contrib });
  });
  return rows.sort((a, b) => Math.abs(b.dInstalls) - Math.abs(a.dInstalls) || Math.abs(b.cpiContribUsd ?? 0) - Math.abs(a.cpiContribUsd ?? 0) || b.cur.costUsd - a.cur.costUsd);
}

/**
 * Tính pulse cho khoảng `range` trên export ĐẦY ĐỦ (chưa lọc) — cần cả kỳ trước.
 * `data` dùng cho export Shopify Ads (target tháng gộp hai kênh).
 */
export function buildGoogleAdsPulse(data: SheetPayload | null | undefined, range: DateRange | null): GoogleAdsPulse | null {
  const g: GoogleAdsPayload | undefined = data?.googleAds;
  if (!g || g.campaigns.length === 0 || !range) return null;
  const cur = g.meta?.currency ?? 'VND';
  const prev = previousRange(range);

  const installsByCampDay = new Map<string, number>();
  for (const a of g.convActions) {
    if (!isInstallAction(a.actionName)) continue;
    const k = `${a.campaignName}${CK}${a.date}`;
    installsByCampDay.set(k, (installsByCampDay.get(k) ?? 0) + a.conversions);
  }

  const tot = { cur: acc(), prev: acc() };
  const campCur = new Map<string, Acc>(), campPrev = new Map<string, Acc>();
  for (const c of g.campaigns) {
    const which = within(c.date, range) ? 'cur' : within(c.date, prev) ? 'prev' : null;
    if (!which) continue;
    const inst = installsByCampDay.get(`${c.campaignName}${CK}${c.date}`) ?? 0;
    const t = tot[which];
    t.impressions += c.impressions; t.clicks += c.clicks; t.cost += c.cost; t.installs += inst;
    const m = which === 'cur' ? campCur : campPrev;
    const e = m.get(c.campaignName) ?? acc();
    e.impressions += c.impressions; e.clicks += c.clicks; e.cost += c.cost; e.installs += inst;
    m.set(c.campaignName, e);
  }
  const T = { cur: finish(tot.cur, cur), prev: finish(tot.prev, cur) };

  const ctryCur = new Map<string, Acc>(), ctryPrev = new Map<string, Acc>();
  const kwCur = new Map<string, Acc>(), kwPrev = new Map<string, Acc>();
  const ctryKey = (r: { countryName: string }) => r.countryName || '(không rõ)';
  const kwKey = (r: { keyword: string; matchType: string }) => `${r.keyword}${r.matchType ? ` [${r.matchType.toLowerCase()}]` : ''}`;
  allocate(g.countries, installsByCampDay, ctryKey, range, ctryCur);
  allocate(g.countries, installsByCampDay, ctryKey, prev, ctryPrev);
  allocate(g.keywords, installsByCampDay, kwKey, range, kwCur);
  allocate(g.keywords, installsByCampDay, kwKey, prev, kwPrev);

  const cpiPrev = T.prev.cpiUsd;
  const byCountry = entityRows(ctryCur, ctryPrev, cur, cpiPrev, T.cur.installs);
  const byCampaign = entityRows(campCur, campPrev, cur, cpiPrev, T.cur.installs);
  const byKeyword = entityRows(kwCur, kwPrev, cur, cpiPrev, T.cur.installs);

  // Δinstall = Δimp×CTR₀×CR₀ + imp₁×ΔCTR×CR₀ + imp₁×CTR₁×ΔCR (ba phần cộng đúng bằng Δ).
  const ctr0 = T.prev.ctr ?? 0, ctr1 = T.cur.ctr ?? 0, cr0 = T.prev.cr ?? 0, cr1 = T.cur.cr ?? 0;
  const installDrivers = {
    traffic: (T.cur.impressions - T.prev.impressions) * ctr0 * cr0,
    ctr: T.cur.impressions * (ctr1 - ctr0) * cr0,
    cr: T.cur.impressions * ctr1 * (cr1 - cr0),
    total: T.cur.installs - T.prev.installs,
  };
  // ΔCPI = ΔCPC/CR₀ + CPC₁×(1/CR₁ − 1/CR₀).
  const cpiDrivers =
    T.cur.cpcUsd !== null && T.prev.cpcUsd !== null && cr0 > 0 && cr1 > 0 && T.cur.cpiUsd !== null && T.prev.cpiUsd !== null
      ? { cpc: (T.cur.cpcUsd - T.prev.cpcUsd) / cr0, cr: T.cur.cpcUsd * (1 / cr1 - 1 / cr0), total: T.cur.cpiUsd - T.prev.cpiUsd }
      : null;

  // Target tháng: tháng của ngày cuối khoảng, từ ngày 1 tới ngày đó, gộp hai kênh.
  const monthTo = range.to;
  const monthFrom = `${monthTo.slice(0, 7)}-01`;
  const monthKey = monthTo.slice(0, 7);
  let googleInstalls = 0;
  installsByCampDay.forEach((v, k) => { const d = k.slice(k.indexOf(CK) + 1); if (d >= monthFrom && d <= monthTo) googleInstalls += v; });
  let shopifyInstalls: number | null = null, shopifyTo: string | null = null;
  for (const r of data?.shopifyDaily ?? []) {
    if (r.date < monthFrom || r.date > monthTo) continue;
    shopifyInstalls = (shopifyInstalls ?? 0) + r.installs;
    if (!shopifyTo || r.date > shopifyTo) shopifyTo = r.date;
  }
  const paidInstalls = googleInstalls + (shopifyInstalls ?? 0);
  const expectedToDate = expectedAdsInstallsForRange(monthFrom, monthTo);
  const rr = runrateAdsForRange(monthFrom, monthTo, paidInstalls);

  return {
    cur: range,
    prev,
    days: daysInRange(range),
    totals: T,
    cpi: {
      limitUsd: GOOGLE_ADS_CPI_LIMIT_USD,
      cur: T.cur.cpiUsd,
      prev: T.prev.cpiUsd,
      over: T.cur.cpiUsd === null ? null : T.cur.cpiUsd > GOOGLE_ADS_CPI_LIMIT_USD,
      deltaPct: T.cur.cpiUsd !== null && T.prev.cpiUsd !== null && T.prev.cpiUsd > 0 ? T.cur.cpiUsd / T.prev.cpiUsd - 1 : null,
    },
    target: {
      monthKey, monthFrom, monthTo,
      monthlyTarget: ADS_MONTHLY_TARGETS[monthKey] ?? null,
      expectedToDate,
      googleInstalls, shopifyInstalls, shopifyTo, paidInstalls,
      pct: expectedToDate && expectedToDate > 0 ? paidInstalls / expectedToDate : null,
      runrate: rr ? { projected: rr.projectedInstalls, pct: rr.pct } : null,
      googleShare: paidInstalls > 0 ? googleInstalls / paidInstalls : null,
    },
    installDrivers,
    cpiDrivers,
    byCountry,
    byCampaign,
    byKeyword,
  };
}
