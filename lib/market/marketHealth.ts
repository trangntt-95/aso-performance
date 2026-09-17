import type { HistoryDailyRow, ShopifyDailyRow } from '@/lib/sheets/types';
import type { GoogleAdsConvActionDay } from '@/lib/sheets/googleAdsTypes';
import { snapshotDateIso } from './organicDiscovery';
import { isInstallAction } from './googleAdsReport';
import { expectedAdsInstalls, ADS_MONTHLY_TARGETS } from '@/lib/config/ads-targets';

// Market Health, bản 17/09/2026.
//
// Trước đó nửa trên của tab là số Apps Script tính trong Market_Index: verdict
// theo "core basket" 10 keyword cố định đứng cạnh users/install toàn account
// (L7: basket +194% "CORE BASKET UP" trong khi account -1,7%), install thực
// đo bằng GA GetApp mọi kênh so với target chỉ dành cho paid Shopify Ads, và
// một đoạn văn executive summary trùng vai với Overview. Ba grain trong một
// card. Bản này trả lời đúng hai câu mà tab khác không có:
//
//   1. Cầu của thị trường đang lên hay xuống — users và install THEO NGÀY, tách
//      organic / paid, kỳ đang chọn so với kỳ liền trước cùng độ dài, nguồn
//      History_Daily (GA4). Overview có biểu đồ ngày nhưng không có kỳ trước và
//      không tách kênh; Search Terms có theo keyword, không có tổng.
//   2. Install paid đang chạy đúng nhịp target không — Shopify Ads CỘNG Google
//      Ads (cùng kỳ, cùng event shopify_app_install) so với ADS_MONTHLY_TARGETS.
//      Trước đây chỉ Shopify, và tử số lại là GA mọi kênh.

export type DemandWindowDays = 7 | 14 | 30 | 60 | 90;
export const DEMAND_WINDOWS: readonly DemandWindowDays[] = [7, 14, 30, 60, 90];

export interface DemandDay {
  date: string;
  /** Ngày thứ mấy trong kỳ (1..N) — để vẽ kỳ trước chồng lên kỳ này. */
  idx: number;
  orgUsers: number;
  paidUsers: number;
  orgInstalls: number;
  paidInstalls: number;
}

export interface DemandTotals {
  orgUsers: number;
  paidUsers: number;
  orgInstalls: number;
  paidInstalls: number;
  users: number;
  installs: number;
  /** install ÷ users, null khi không có users. */
  orgCr: number | null;
  paidCr: number | null;
  /** paidUsers ÷ users. */
  paidShare: number | null;
  /** Số ngày có ít nhất một dòng trong History_Daily — độ phủ của kỳ. */
  daysWithData: number;
}

export interface DemandWindow {
  from: string;
  to: string;
  days: DemandDay[];
  totals: DemandTotals;
}

export interface DemandTrend {
  windowDays: DemandWindowDays;
  cur: DemandWindow;
  prev: DemandWindow;
  /** (cur − prev) ÷ prev cho từng số; null khi prev = 0. */
  delta: Record<'orgUsers' | 'paidUsers' | 'orgInstalls' | 'paidInstalls' | 'users' | 'installs', number | null>;
  /** Ngày cuối có dữ liệu — mốc "hôm nay" của tab. */
  asOf: string;
}

const DAY_MS = 86400000;
const shift = (iso: string, days: number): string => new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
const pct = (a: number, b: number): number | null => (b > 0 ? (a - b) / b : null);

function totalsOf(days: DemandDay[]): DemandTotals {
  const t = { orgUsers: 0, paidUsers: 0, orgInstalls: 0, paidInstalls: 0 };
  let daysWithData = 0;
  for (const d of days) {
    t.orgUsers += d.orgUsers;
    t.paidUsers += d.paidUsers;
    t.orgInstalls += d.orgInstalls;
    t.paidInstalls += d.paidInstalls;
    if (d.orgUsers + d.paidUsers + d.orgInstalls + d.paidInstalls > 0) daysWithData++;
  }
  const users = t.orgUsers + t.paidUsers;
  const installs = t.orgInstalls + t.paidInstalls;
  return {
    ...t,
    users,
    installs,
    orgCr: t.orgUsers > 0 ? t.orgInstalls / t.orgUsers : null,
    paidCr: t.paidUsers > 0 ? t.paidInstalls / t.paidUsers : null,
    paidShare: users > 0 ? t.paidUsers / users : null,
    daysWithData,
  };
}

/**
 * Users/install theo ngày từ History_Daily, tách organic/paid, kỳ đang chọn và
 * kỳ liền trước cùng độ dài. Kỳ kết thúc ở ngày cuối có dữ liệu (`asOf`), không
 * ở hôm nay, để một ngày tracker chưa chạy không thành "hôm nay bằng 0".
 *
 * Chỉ đọc dòng có `usersDaily` (History_Daily trộn nhiều nguồn; dòng L7
 * snapshot không có số ngày). Không đếm đôi vì mỗi (ngày, keyword, surface)
 * là một dòng — đo 17/09/2026: 7 dòng trùng trên 24.680.
 */
export function buildDemandTrend(
  rows: readonly HistoryDailyRow[],
  windowDays: DemandWindowDays,
  asOfIso?: string,
): DemandTrend | null {
  const byDate = new Map<string, DemandDay>();
  let maxDate = '';
  for (const r of rows) {
    if (r.usersDaily === null || r.usersDaily === undefined) continue;
    const date = snapshotDateIso(r.snapshotDate);
    if (!date) continue;
    if (date > maxDate) maxDate = date;
    const d = byDate.get(date) ?? { date, idx: 0, orgUsers: 0, paidUsers: 0, orgInstalls: 0, paidInstalls: 0 };
    const paid = r.surface === 'search_ad';
    if (paid) {
      d.paidUsers += r.usersDaily ?? 0;
      d.paidInstalls += r.getAppDaily ?? 0;
    } else {
      d.orgUsers += r.usersDaily ?? 0;
      d.orgInstalls += r.getAppDaily ?? 0;
    }
    byDate.set(date, d);
  }
  if (!maxDate) return null;
  const asOf = asOfIso && asOfIso < maxDate ? asOfIso : maxDate;

  const build = (to: string): DemandWindow => {
    const from = shift(to, -(windowDays - 1));
    const days: DemandDay[] = [];
    for (let i = 0; i < windowDays; i++) {
      const date = shift(from, i);
      const d = byDate.get(date);
      days.push(d ? { ...d, idx: i + 1 } : { date, idx: i + 1, orgUsers: 0, paidUsers: 0, orgInstalls: 0, paidInstalls: 0 });
    }
    return { from, to, days, totals: totalsOf(days) };
  };
  const cur = build(asOf);
  const prev = build(shift(cur.from, -1));
  const c = cur.totals, p = prev.totals;
  return {
    windowDays,
    cur,
    prev,
    delta: {
      orgUsers: pct(c.orgUsers, p.orgUsers),
      paidUsers: pct(c.paidUsers, p.paidUsers),
      orgInstalls: pct(c.orgInstalls, p.orgInstalls),
      paidInstalls: pct(c.paidInstalls, p.paidInstalls),
      users: pct(c.users, p.users),
      installs: pct(c.installs, p.installs),
    },
    asOf,
  };
}

// ── Pacing install paid so với target ────────────────────────────────────────

export interface InstallPacing {
  from: string;
  to: string;
  windowDays: number;
  shopifyInstalls: number;
  googleInstalls: number;
  installs: number;
  /** Target cho kỳ, từ ADS_MONTHLY_TARGETS (pro-rate theo ngày). null khi tháng chưa có target. */
  target: number | null;
  /** installs ÷ target. */
  pct: number | null;
  perDay: number;
  targetPerDay: number | null;
  /** Kỳ trước cùng độ dài, để nói "đang nhanh lên hay chậm lại". */
  prevInstalls: number;
  /** Tháng nào đang thiếu target — để nhắc điền lib/config/ads-targets.ts. */
  missingTargetMonths: string[];
}

/**
 * Install paid trong kỳ = Shopify Ads (export theo ngày) + Google Ads (conversion
 * action install, cùng event shopify_app_install), so với target tháng pro-rate.
 * Kỳ kết thúc ở ngày cuối có dữ liệu của Shopify export — Google Ads thường trễ
 * hơn một ngày, phần trễ đó ghi ở footer chứ không ép về cùng ngày.
 */
export function buildInstallPacing(
  shopifyDaily: readonly ShopifyDailyRow[],
  convActions: readonly GoogleAdsConvActionDay[],
  windowDays: number,
  asOfIso?: string,
): InstallPacing | null {
  let maxDate = asOfIso ?? '';
  if (!maxDate) for (const r of shopifyDaily) if (r.date > maxDate) maxDate = r.date;
  if (!maxDate) return null;
  const to = maxDate;
  const from = shift(to, -(windowDays - 1));
  const prevTo = shift(from, -1);
  const prevFrom = shift(prevTo, -(windowDays - 1));
  let shopify = 0, google = 0, prev = 0;
  for (const r of shopifyDaily) {
    if (r.date >= from && r.date <= to) shopify += r.installs;
    else if (r.date >= prevFrom && r.date <= prevTo) prev += r.installs;
  }
  for (const a of convActions) {
    if (!isInstallAction(a.actionName)) continue;
    if (a.date >= from && a.date <= to) google += a.conversions;
    else if (a.date >= prevFrom && a.date <= prevTo) prev += a.conversions;
  }
  const asOf = new Date(Date.parse(to));
  const target = expectedAdsInstalls(windowDays, asOf);
  const installs = shopify + google;
  const missing: string[] = [];
  for (let i = 0; i < Math.ceil(windowDays / 30); i++) {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (ADS_MONTHLY_TARGETS[k] === undefined) missing.push(k);
  }
  return {
    from,
    to,
    windowDays,
    shopifyInstalls: shopify,
    googleInstalls: Math.round(google * 100) / 100,
    installs: Math.round(installs * 100) / 100,
    target,
    pct: target && target > 0 ? installs / target : null,
    perDay: installs / windowDays,
    targetPerDay: target !== null ? target / windowDays : null,
    prevInstalls: Math.round(prev * 100) / 100,
    missingTargetMonths: missing,
  };
}
