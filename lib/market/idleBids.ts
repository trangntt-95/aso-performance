import type { KeywordRow, SheetPayload, SnapshotRow } from '@/lib/sheets/types';
import { normKw } from '@/lib/sheets/kwNorm';
import { resolveCampCategory } from './categoryTaxonomy';
import { buildKeywordCampIndex, type OriginCamp } from './installOrigin';

// Keyword đang bid (Master, camp chưa tắt) mà KHÔNG có một người paid nào bấm
// vào trong cửa sổ — mặt trái của Paid Coverage. Bảng chính hỏi "có người tìm
// mà mình chưa mua?"; bảng này hỏi "mình đang mua mà không ai thấy?".
//
// Đo 16/09/2026: 945 keyword Competitor active thì 920 không có users paid L90.
// Trước khi kết luận "tăng bid để có data" cần tách ba nhóm, vì bid chỉ mua
// được lượt hiển thị ở keyword CÓ NGƯỜI GÕ:
//
//   demand  có nhu cầu thật — organic L365 từ 3 users, hoặc paid từng ra
//           install trong L365. Không hiển thị là do thua đấu giá → tăng bid
//           là đúng chỗ.
//   weak    tín hiệu yếu — 1-2 users organic, vài users paid không install,
//           hoặc chỉ có impression trong export Shopify. Thử nhẹ vài keyword.
//   none    không có gì ở đâu trong 12 tháng: không organic, không paid,
//           không impression. Hiển thị 0 vì không có phiên tìm, không phải vì
//           bid thấp → tăng bid chỉ mua click lạc từ broad. Giữ bid sàn hoặc xoá.
//
// Nguồn "lịch sử" để chia nhóm là All_L365; khi tab đó trống (Country_L365
// từng trống hàng tháng) rơi về All_L90 và nói rõ ở `historyWindow`, vì chia
// nhóm bằng 90 ngày sẽ đẩy nhiều keyword sang 'none' hơn thực tế.

export type IdleWindow = 'L30' | 'L90';
export const IDLE_WINDOWS: readonly IdleWindow[] = ['L30', 'L90'];

export type IdleGroup = 'demand' | 'weak' | 'none';
export const IDLE_GROUPS: readonly IdleGroup[] = ['demand', 'weak', 'none'];

/** Organic users (lịch sử) từ mức này trở lên là có nhu cầu thật. */
export const DEMAND_ORGANIC_USERS = 3;

export interface IdleBidRow {
  keyword: string;
  /** Category canonical của camp (Competitor, Profit, …), hoặc nhãn thô nếu không đọc được. */
  category: string;
  group: IdleGroup;
  /** Camp chưa tắt đang bid keyword này, xếp theo bid giảm dần. */
  camps: OriginCamp[];
  bidMax: number | null;
  bidMin: number | null;
  /** Lịch sử (L365, hoặc L90 khi L365 trống) — cùng keyword, hai surface. */
  organicUsers: number;
  organicInstalls: number;
  paidUsers: number;
  paidInstalls: number;
  /** Từ export Shopify Ads: keyword này hiện ra bao nhiêu lần (kể cả 0 click). */
  exportImpressions: number;
  exportClicks: number;
  /** Đã nằm trong Negative KW list mà vẫn bid — mâu thuẫn cần xem. */
  negative: boolean;
}

export interface IdleCategoryCount {
  category: string;
  /** Keyword active của category. */
  active: number;
  /** Trong đó không có users paid trong cửa sổ. */
  idle: number;
}

export interface IdleBidsReport {
  window: IdleWindow;
  /** Cửa sổ dùng để chia nhóm: 'L365' bình thường, 'L90' khi All_L365 trống. */
  historyWindow: 'L365' | 'L90';
  /** Số keyword active (có ít nhất một camp chưa tắt) trên toàn Master. */
  activeKeywords: number;
  rows: IdleBidRow[];
  counts: Record<IdleGroup, number>;
  categories: IdleCategoryCount[];
  /** Export Shopify có dữ liệu — cột impression mới có nghĩa. */
  hasExport: boolean;
}

const isPaid = (r: { surface: string }) => r.surface === 'search_ad';
const usersOf = (r: KeywordRow | SnapshotRow) => ('usersL' in r ? r.usersL : r.users);
const installsOf = (r: KeywordRow | SnapshotRow) => ('getAppL' in r ? r.getAppL : r.getApp);

interface Pair {
  users: number;
  installs: number;
}

/** keyword → tổng users/installs của một surface trong một tab. */
function sumBySurface(rows: readonly (KeywordRow | SnapshotRow)[], paid: boolean): Map<string, Pair> {
  const out = new Map<string, Pair>();
  for (const r of rows) {
    if (isPaid(r) !== paid) continue;
    const k = normKw(r.searchTerm);
    if (!k) continue;
    const e = out.get(k) ?? { users: 0, installs: 0 };
    e.users += usersOf(r);
    e.installs += installsOf(r);
    out.set(k, e);
  }
  return out;
}

export function groupOf(input: {
  organicUsers: number;
  paidUsers: number;
  paidInstalls: number;
  exportImpressions: number;
}): IdleGroup {
  if (input.organicUsers >= DEMAND_ORGANIC_USERS || input.paidInstalls >= 1) return 'demand';
  if (input.organicUsers > 0 || input.paidUsers > 0 || input.exportImpressions > 0) return 'weak';
  return 'none';
}

export function buildIdleBidsReport(
  data: SheetPayload | null | undefined,
  window: IdleWindow = 'L90',
): IdleBidsReport | null {
  if (!data) return null;
  const master = data.masterKwLookup ?? [];
  if (master.length === 0) return null;

  // Users paid trong cửa sổ: All_L* bị cắt top 500, nên một keyword vắng ở All
  // vẫn có thể có phiên trong Country_L*. Lấy max của hai nguồn, không cộng —
  // Country là phân rã của All, cộng vào là đếm đôi.
  const allWin = window === 'L30' ? data.allL30 ?? [] : data.allL90 ?? [];
  const countryWin = window === 'L30' ? data.countryL30 ?? [] : data.countryL90 ?? [];
  const paidAll = sumBySurface(allWin, true);
  const paidCountry = sumBySurface(countryWin, true);
  const paidUsersInWindow = (k: string) =>
    Math.max(paidAll.get(k)?.users ?? 0, paidCountry.get(k)?.users ?? 0);

  const has365 = (data.allL365 ?? []).length > 0;
  const historyRows: readonly (KeywordRow | SnapshotRow)[] = has365 ? data.allL365 : data.allL90 ?? [];
  const histOrganic = sumBySurface(historyRows, false);
  const histPaid = sumBySurface(historyRows, true);

  // Export Shopify Ads: ghép theo keyword đã bắt được câu, và theo chính câu
  // (keyword exact thì câu trùng keyword).
  const exportRows = data.searchTermUnbidded ?? [];
  const exportByKw = new Map<string, { impressions: number; clicks: number }>();
  for (const r of exportRows) {
    const a = normKw(r.matchedKeyword ?? '');
    const b = normKw(r.searchTerm ?? '');
    for (const k of a === b ? [a] : [a, b]) {
      if (!k) continue;
      const e = exportByKw.get(k) ?? { impressions: 0, clicks: 0 };
      e.impressions += r.impressions ?? 0;
      e.clicks += r.clicks ?? 0;
      exportByKw.set(k, e);
    }
  }

  const campIndex = buildKeywordCampIndex(data);
  const negatives = new Set((data.negativeKw ?? []).map(normKw).filter(Boolean));

  // Category theo camp đầu tiên còn sống; keyword nằm ở nhiều category thì lấy
  // category xuất hiện nhiều nhất trong các camp sống của nó.
  const campCategory = new Map<string, Map<string, string>>(); // keyword → camp → category
  const seenKw = new Map<string, string>();
  for (const m of master) {
    const k = normKw(m.keyword);
    if (!k) continue;
    if (!seenKw.has(k)) seenKw.set(k, m.keyword.trim());
    const cat = resolveCampCategory(m.category ?? '', m.camp ?? '') ?? (m.category?.trim() || 'Khác');
    const byCamp = campCategory.get(k) ?? new Map<string, string>();
    byCamp.set(m.camp?.trim() ?? '', cat);
    campCategory.set(k, byCamp);
  }

  const rows: IdleBidRow[] = [];
  const counts: Record<IdleGroup, number> = { demand: 0, weak: 0, none: 0 };
  const catCount = new Map<string, IdleCategoryCount>();
  let activeKeywords = 0;

  seenKw.forEach((display, k) => {
    const camps = campIndex.get(display);
    if (camps.live.length === 0) return;
    activeKeywords += 1;

    const byCamp = campCategory.get(k);
    const tally = new Map<string, number>();
    for (const c of camps.live) {
      const cat = byCamp?.get(c.camp) ?? 'Khác';
      tally.set(cat, (tally.get(cat) ?? 0) + 1);
    }
    let category = 'Khác';
    let best = -1;
    tally.forEach((n, cat) => {
      if (n > best) {
        best = n;
        category = cat;
      }
    });

    const cc = catCount.get(category) ?? { category, active: 0, idle: 0 };
    cc.active += 1;
    catCount.set(category, cc);

    if (paidUsersInWindow(k) > 0) return;
    cc.idle += 1;

    const o = histOrganic.get(k) ?? { users: 0, installs: 0 };
    const p = histPaid.get(k) ?? { users: 0, installs: 0 };
    const ex = exportByKw.get(k) ?? { impressions: 0, clicks: 0 };
    const group = groupOf({
      organicUsers: o.users,
      paidUsers: p.users,
      paidInstalls: p.installs,
      exportImpressions: ex.impressions,
    });
    counts[group] += 1;
    rows.push({
      keyword: display,
      category,
      group,
      camps: camps.live,
      bidMax: camps.bidMax,
      bidMin: camps.bidMin,
      organicUsers: o.users,
      organicInstalls: o.installs,
      paidUsers: p.users,
      paidInstalls: p.installs,
      exportImpressions: ex.impressions,
      exportClicks: ex.clicks,
      negative: negatives.has(k),
    });
  });

  const order: Record<IdleGroup, number> = { demand: 0, weak: 1, none: 2 };
  rows.sort(
    (a, b) =>
      order[a.group] - order[b.group] ||
      signalOf(b) - signalOf(a) ||
      (b.bidMax ?? 0) - (a.bidMax ?? 0) ||
      a.keyword.localeCompare(b.keyword),
  );

  return {
    window,
    historyWindow: has365 ? 'L365' : 'L90',
    activeKeywords,
    rows,
    counts,
    categories: Array.from(catCount.values()).sort((a, b) => b.idle - a.idle || a.category.localeCompare(b.category)),
    hasExport: exportRows.length > 0,
  };
}

/** Bằng chứng có người tìm — dùng để xếp trong cùng một nhóm. */
export function signalOf(r: Pick<IdleBidRow, 'organicUsers' | 'paidUsers' | 'paidInstalls' | 'exportImpressions'>): number {
  return r.paidInstalls * 20 + r.organicUsers * 3 + r.paidUsers * 2 + Math.min(r.exportImpressions, 200) / 20;
}
