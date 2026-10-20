// Số liệu dẫn xuất cho tab Meta Ads · Proveny. Thuần hàm, không React.
//
// Hai ý tưởng chính:
// 1. "Kết quả chính" thống nhất: mỗi campaign tối ưu một event khác nhau
//    (FirstVideoCreated / Create Video / Visit App) nên bảng luôn ghi kèm tên
//    event, còn dải KPI cộng theo event chứ không trộn.
// 2. "Nước trả tiền": campaign WW cho CPR rất rẻ nhưng tiền rơi vào Egypt,
//    Indonesia, Bangladesh… Tính % chi vào danh sách Paid Countries mà team
//    Proveny tự định nghĩa trong targeting để lật CPR ảo.

import type { MetaAdRow, MetaCampaignRow, MetaCountryRow, MetaDailyRow, MetaProvenyPayload } from './types';

/** Danh sách geo "Paid Countries" lấy từ targeting adset của team (10/2026). */
export const PAID_COUNTRIES = new Set([
  'US', 'GE', 'IE', 'IT', 'JP', 'PF', 'LB', 'VI', 'MX', 'GF', 'NL', 'GI', 'NZ', 'AX', 'NO', 'CA', 'SA', 'SG', 'AN', 'TF',
  'BL', 'GS', 'ES', 'UM', 'SE', 'CH', 'TR', 'GB', 'FI', 'DK', 'BE', 'GR', 'AR', 'AU', 'TH', 'CL', 'AT', 'HK', 'PL', 'PT',
  'BG', 'CO', 'SK', 'LT', 'HU', 'MA', 'CY', 'RO', 'FR', 'UY', 'DE', 'EE', 'LV',
]);

export const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export interface Kpis {
  days: number;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  lpv: number;
  plays: number;
  thruplays: number;
  p25: number;
  p100: number;
  firstVideoCreated: number;
  startTrials: number;
  subscribes: number;
  purchases: number;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  costPerLpv: number | null;
  lpvRate: number | null; // lpv / link clicks
  hookRate: number | null; // p25 / plays
  holdRate: number | null; // thruplay / plays
  costPerFvc: number | null;
  costPerTrial: number | null;
}

export function kpis(rows: MetaDailyRow[]): Kpis {
  const s = (k: keyof MetaDailyRow) => rows.reduce((t, r) => t + (r[k] as number), 0);
  const spend = s('spend');
  const impressions = s('impressions');
  const clicks = s('clicks');
  const linkClicks = s('linkClicks');
  const lpv = s('lpv');
  const plays = s('plays');
  const thruplays = s('thruplays');
  const p25 = s('p25');
  const firstVideoCreated = s('firstVideoCreated');
  const startTrials = s('startTrials');
  return {
    days: rows.length,
    spend,
    impressions,
    reach: s('reach'),
    clicks,
    linkClicks,
    lpv,
    plays,
    thruplays,
    p25,
    p100: s('p100'),
    firstVideoCreated,
    startTrials,
    subscribes: s('subscribes'),
    purchases: s('purchases'),
    ctr: ratio(clicks, impressions),
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    cpc: ratio(spend, clicks),
    costPerLpv: ratio(spend, lpv),
    lpvRate: ratio(lpv, linkClicks),
    hookRate: ratio(p25, plays),
    holdRate: ratio(thruplays, plays),
    costPerFvc: ratio(spend, firstVideoCreated),
    costPerTrial: ratio(spend, startTrials),
  };
}

/** Ngày có chi tiêu, mới nhất cuối. */
export function activeDays(daily: MetaDailyRow[]): MetaDailyRow[] {
  return daily.filter((d) => d.spend > 0 || d.impressions > 0).sort((a, b) => a.date.localeCompare(b.date));
}

/** Cửa sổ N ngày cuối và N ngày liền trước (để tính delta). */
export function windows(daily: MetaDailyRow[], days: number): { current: MetaDailyRow[]; previous: MetaDailyRow[] } {
  const rows = activeDays(daily);
  const current = rows.slice(-days);
  const previous = rows.slice(Math.max(0, rows.length - 2 * days), rows.length - days);
  return { current, previous };
}

export function delta(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return cur / prev - 1;
}

// ---- Creative ----
export interface CreativeStats {
  hook: number | null; // p25 / plays
  hold: number | null; // thruplay / plays
  complete: number | null; // p100 / p25
  ctr: number | null;
  cpm: number | null;
  lpvRate: number | null;
  costPerLpv: number | null;
  cpr: number | null;
}

export function creativeStats(a: MetaAdRow): CreativeStats {
  return {
    hook: ratio(a.p25, a.plays),
    hold: ratio(a.thruplays, a.plays),
    complete: ratio(a.p100, a.p25),
    ctr: ratio(a.clicks, a.impressions),
    cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null,
    lpvRate: ratio(a.lpv, a.linkClicks),
    costPerLpv: ratio(a.spend, a.lpv),
    cpr: ratio(a.spend, a.results),
  };
}

export function campaignStats(c: MetaCampaignRow) {
  return {
    ctr: ratio(c.clicks, c.impressions),
    cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : null,
    costPerLpv: ratio(c.spend, c.lpv),
    lpvRate: ratio(c.lpv, c.linkClicks),
    cpr: ratio(c.spend, c.results),
    hold: ratio(c.thruplays, c.plays),
    costPerTrial: ratio(c.spend, c.startTrials),
  };
}

// ---- Geo ----
export interface GeoSummary {
  total: number;
  paid: number;
  paidShare: number | null;
  topCheap: MetaCountryRow[];
}

export function geoSummary(countries: MetaCountryRow[]): GeoSummary {
  const total = countries.reduce((t, r) => t + r.spend, 0);
  const paid = countries.filter((r) => PAID_COUNTRIES.has(r.country)).reduce((t, r) => t + r.spend, 0);
  const topCheap = countries
    .filter((r) => !PAID_COUNTRIES.has(r.country))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 3);
  return { total, paid, paidShare: ratio(paid, total), topCheap };
}

// ---- Alerts ----
export type AlertLevel = 'bad' | 'warn' | 'info';
export interface Alert {
  level: AlertLevel;
  title: string;
  detail: string;
}

const pct = (x: number) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;
const usd = (x: number) => `$${x.toFixed(x >= 100 ? 0 : 2)}`;

export function alerts(p: MetaProvenyPayload, names: (iso: string) => string): Alert[] {
  const out: Alert[] = [];
  const { current, previous } = windows(p.daily, 7);
  if (current.length >= 5 && previous.length >= 5) {
    const c = kpis(current);
    const pv = kpis(previous);
    const dCtr = delta(c.ctr, pv.ctr);
    const dCpm = delta(c.cpm, pv.cpm);
    const dLpv = delta(c.costPerLpv, pv.costPerLpv);
    if (dCtr !== null && dCtr <= -0.25) {
      out.push({
        level: 'bad',
        title: `CTR 7 ngày giảm ${pct(dCtr)}`,
        detail: `${(pv.ctr! * 100).toFixed(2)}% → ${(c.ctr! * 100).toFixed(2)}%. Người xem bớt bấm dù vẫn được phát: dấu hiệu creative mệt hoặc audience mở rộng sang nhóm không hợp.`,
      });
    }
    if (dCpm !== null && dCpm >= 0.25) {
      out.push({
        level: 'warn',
        title: `CPM 7 ngày tăng ${pct(dCpm)}`,
        detail: `${usd(pv.cpm!)} → ${usd(c.cpm!)} mỗi 1.000 lượt hiện. Đấu giá đắt lên, thường do geo đắt chiếm nhiều hơn hoặc tần suất tăng.`,
      });
    }
    if (dLpv !== null && dLpv >= 0.5) {
      out.push({
        level: 'warn',
        title: `Cost / landing page view tăng ${pct(dLpv)}`,
        detail: `${usd(pv.costPerLpv!)} → ${usd(c.costPerLpv!)}. Mỗi người tới trang đắt hơn hẳn tuần trước.`,
      });
    }
  }

  const geo = geoSummary(p.countries);
  if (geo.paidShare !== null && geo.paidShare < 0.6) {
    out.push({
      level: 'bad',
      title: `Chỉ ${(geo.paidShare * 100).toFixed(0)}% chi tiêu rơi vào nước trả tiền`,
      detail: `Phần còn lại vào ${geo.topCheap.map((r) => `${names(r.country)} ${usd(r.spend)}`).join(', ')}… CPR rẻ ở đây không quy ra doanh thu.`,
    });
  }

  for (const a of p.ads) {
    if (a.status === 'ACTIVE' && a.spend >= 20 && a.results === 0) {
      out.push({
        level: 'warn',
        title: `Ad "${a.name}" đốt ${usd(a.spend)} chưa ra kết quả`,
        detail: `${a.campaignName}. ${a.lpv} landing page view, ${a.impressions.toLocaleString('en-US')} lượt hiện. Cân nhắc tắt hoặc đổi creative.`,
      });
    }
    if (a.status === 'ACTIVE' && a.frequency >= 2.5) {
      out.push({
        level: 'warn',
        title: `Ad "${a.name}" tần suất ${a.frequency.toFixed(1)}`,
        detail: 'Mỗi người đã thấy quá 2,5 lần trong 30 ngày: audience bão hoà, CTR sẽ tụt tiếp.',
      });
    }
  }

  const desktop = p.placements.filter((r) => r.device === 'desktop').reduce((t, r) => t + r.spend, 0);
  const totalPl = p.placements.reduce((t, r) => t + r.spend, 0);
  if (totalPl > 0 && desktop / totalPl >= 0.85) {
    out.push({
      level: 'info',
      title: `${((desktop / totalPl) * 100).toFixed(0)}% chi tiêu ở desktop`,
      detail: 'Targeting đang khoá desktop (hợp lý cho app Shopify). Reels / mobile gần như chưa thử.',
    });
  }

  return out.sort((a, b) => ['bad', 'warn', 'info'].indexOf(a.level) - ['bad', 'warn', 'info'].indexOf(b.level));
}

/** Tên nước từ mã ISO-2 (tiếng Anh, khớp bảng tier của dashboard). */
export function countryName(iso: string): string {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    return dn.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

export function shortCampaign(name: string): string {
  // "Proveny_Sales_1410_First Video Create_WW" → "1410 · First Video Create · WW"
  const parts = name.split('_').filter(Boolean);
  if (parts.length >= 4) return `${parts[2]} · ${parts.slice(3).join(' · ')}`;
  return name;
}
