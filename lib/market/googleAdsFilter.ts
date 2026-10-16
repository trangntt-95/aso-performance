import type { GoogleAdsPayload } from '@/lib/sheets/googleAdsTypes';

// Lọc toàn bộ export Google Ads theo khoảng ngày (ISO, inclusive). Mọi tab của
// export đều có cột date nên lọc một lần ở đây rồi đưa vào các builder
// (report, deep, brand demand, pulse) — tab Google Ads lọc ngày ở một chỗ,
// không cần mỗi bảng tự lọc (Trang 16/10/2026: "phải filter được ngày").

export interface DateRange { from: string; to: string }

const within = (d: string, r: DateRange) => d >= r.from && d <= r.to;

export function filterGoogleAdsPayload(g: GoogleAdsPayload, range: DateRange | null): GoogleAdsPayload {
  if (!range) return g;
  return {
    campaigns: g.campaigns.filter((r) => within(r.date, range)),
    share: g.share.filter((r) => within(r.date, range)),
    searchTerms: g.searchTerms.filter((r) => within(r.date, range)),
    convActions: g.convActions.filter((r) => within(r.date, range)),
    landing: g.landing.filter((r) => within(r.date, range)),
    keywords: g.keywords.filter((r) => within(r.date, range)),
    countries: g.countries.filter((r) => within(r.date, range)),
    bidding: g.bidding.filter((r) => within(r.date, range)),
    devices: g.devices.filter((r) => within(r.date, range)),
    assets: g.assets.filter((r) => within(r.date, range)),
    meta: g.meta,
  };
}

/** Ngày đầu / cuối có data trong campaign_daily. */
export function googleAdsDateBounds(g: GoogleAdsPayload | null | undefined): DateRange | null {
  if (!g || g.campaigns.length === 0) return null;
  let from = '', to = '';
  for (const r of g.campaigns) {
    if (!r.date) continue;
    if (!from || r.date < from) from = r.date;
    if (!to || r.date > to) to = r.date;
  }
  return from && to ? { from, to } : null;
}

const DAY = 86400000;
export const isoAddDays = (s: string, n: number) => new Date(Date.parse(s) + n * DAY).toISOString().slice(0, 10);
export const daysInRange = (r: DateRange) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / DAY) + 1;

export type GadsPreset = 'MTD' | 'L7' | 'L14' | 'L30' | 'ALL';

/** Khoảng cho một preset, neo vào ngày cuối có data. */
export function presetRange(preset: GadsPreset, bounds: DateRange): DateRange {
  const end = bounds.to;
  switch (preset) {
    case 'MTD': return { from: `${end.slice(0, 7)}-01`, to: end };
    case 'L7': return { from: isoAddDays(end, -6), to: end };
    case 'L14': return { from: isoAddDays(end, -13), to: end };
    case 'L30': return { from: isoAddDays(end, -29), to: end };
    default: return bounds;
  }
}

/**
 * Kỳ liền trước cùng độ dài. Với khoảng bắt đầu ngày 1 của tháng (kiểu "tháng
 * này"), kỳ trước là cùng số ngày của tháng trước, để 1→16/10 so với 1→16/09.
 */
export function previousRange(r: DateRange): DateRange {
  if (r.from.slice(8, 10) === '01') {
    const y = Number(r.from.slice(0, 4)), m = Number(r.from.slice(5, 7));
    const pm = new Date(Date.UTC(y, m - 2, 1));
    const pmDays = new Date(Date.UTC(pm.getUTCFullYear(), pm.getUTCMonth() + 1, 0)).getUTCDate();
    const pFrom = pm.toISOString().slice(0, 10);
    const dayN = Math.min(Number(r.to.slice(8, 10)), pmDays);
    return { from: pFrom, to: `${pFrom.slice(0, 7)}-${String(dayN).padStart(2, '0')}` };
  }
  const n = daysInRange(r);
  return { from: isoAddDays(r.from, -n), to: isoAddDays(r.from, -1) };
}
