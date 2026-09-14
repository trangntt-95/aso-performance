import type { KeywordRow, NetValueRow, SheetPayload, SnapshotRow } from '@/lib/sheets/types';
import { normKw } from '@/lib/sheets/kwNorm';
import { sumNetValueAggs, type NetValueAgg, type NetValuePick } from '@/lib/market/keywordNetValue';

// Giá trị install ở grain Country × Category — grain của bảng 'Max bid cap'.
//
// Tab Net value per install có keyword và nước nhưng KHÔNG có category theo
// vocabulary của Bid Cap; nó có 5 cluster riêng (Generic profit / Brand /
// Other generic / Competitor brand / Long tail). Nếu chỉ ánh xạ cluster thì
// 'Other generic' đổ lẫn Feature, Others, Noise và Language vào một chỗ (đo
// 11/09/2026: 286 install → Others, 121 → Feature, 75 → Noise, 12 → Language).
//
// Nên category của một dòng lấy theo KEYWORD, từ chính bộ phân loại của các
// tab All_L* / Country_L* (cùng bộ mà Categories và Overview dùng) — phủ được
// 1627/1716 install. Cluster chỉ là đường lùi cho keyword không có trong tab
// nào, để 89 install còn lại không biến mất khỏi ô.

/** Cluster của tab Net value → category Bid Cap, chỉ dùng khi keyword không
 *  nằm trong bất kỳ tab All_L* nào. */
const CLUSTER_FALLBACK: Record<string, string> = {
  brand: 'Brand',
  'competitor brand': 'Competitor',
  'generic profit': 'Profit',
  'other generic': 'Others',
  'long tail': 'Others',
};

/** Category phía keyword (All_L*) → category phía tiền ('Max bid cap'). Hai bộ
 *  gần trùng; chỉ Noise là không có bên Bid Cap. */
const KEYWORD_TO_BIDCAP: Record<string, string> = {
  noise: 'Others',
  brandname: 'Brand',
};

export const cellKey = (country: string, category: string): string =>
  `${country.trim().toLowerCase()}|${category.trim().toLowerCase()}`;

/** keyword đã chuẩn hoá → category, dòng đầu tiên có category thắng. Đọc tab
 *  dài nhất trước để phủ nhiều keyword nhất. */
export function keywordCategoryIndex(data: SheetPayload | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!data) return out;
  const tabs: (KeywordRow[] | SnapshotRow[] | undefined)[] = [
    data.allL365,
    data.allL90,
    data.allL30,
    data.allL7,
    data.countryL90,
    data.countryL30,
  ];
  for (const rows of tabs) {
    for (const r of rows ?? []) {
      if (!r.category) continue;
      const k = normKw(r.searchTerm);
      if (k && !out.has(k)) out.set(k, r.category);
    }
  }
  return out;
}

function bidCapCategoryOf(r: NetValueRow, kwCat: Map<string, string>): string | null {
  const fromKw = kwCat.get(normKw(r.keyword ?? ''));
  if (fromKw) return KEYWORD_TO_BIDCAP[fromKw.toLowerCase()] ?? fromKw;
  const fromCluster = CLUSTER_FALLBACK[(r.cluster ?? '').trim().toLowerCase()];
  return fromCluster ?? null;
}

/**
 * cellKey(country, category) → giá trị install gộp trên mọi keyword của ô.
 *
 * Mặc định 'paid' vì Bid Cap là bảng đặt bid: câu hỏi là một install MUA về ở
 * ô này đáng bao nhiêu, so với trần CPI đang đặt cho nó.
 */
export function buildCellNetValue(
  data: SheetPayload | null | undefined,
  pick: NetValuePick = 'paid',
): Map<string, NetValueAgg> {
  const out = new Map<string, NetValueAgg>();
  const rows = data?.netValuePerInstall ?? [];
  if (rows.length === 0) return out;
  const kwCat = keywordCategoryIndex(data);
  const groups = new Map<string, NetValueAgg[]>();
  for (const r of rows as NetValueRow[]) {
    if (!r.country) continue;
    if (pick !== 'all' && (r.surface === 'search_ad' ? 'paid' : 'organic') !== pick) continue;
    const cat = bidCapCategoryOf(r, kwCat);
    if (!cat) continue;
    const key = cellKey(r.country, cat);
    const agg: NetValueAgg = {
      installs: r.installs ?? 0,
      payingShops: r.payingShops ?? 0,
      netValue: r.netValue ?? 0,
      netPerInstall: null,
      thin: false,
      thinReason: '',
    };
    const arr = groups.get(key);
    if (arr) arr.push(agg);
    else groups.set(key, [agg]);
  }
  groups.forEach((items, key) => {
    const s = sumNetValueAggs(items);
    if (s) out.set(key, s);
  });
  return out;
}

/**
 * category (chữ thường) → giá trị install gộp mọi nước, mọi keyword của category.
 *
 * Cùng cách phân loại với buildCellNetValue (keyword → category theo All_L*,
 * cluster là đường lùi) để bảng Country × Category và bảng theo category không
 * ra hai con số khác nhau cho cùng một category. `pick` theo bộ lọc kênh của
 * trang: 'all' khi không lọc, 'paid' / 'organic' khi lọc.
 */
export function buildCategoryNetValue(
  data: SheetPayload | null | undefined,
  pick: NetValuePick = 'all',
): Map<string, NetValueAgg> {
  const out = new Map<string, NetValueAgg>();
  const rows = data?.netValuePerInstall ?? [];
  if (rows.length === 0) return out;
  const kwCat = keywordCategoryIndex(data);
  const groups = new Map<string, NetValueAgg[]>();
  for (const r of rows as NetValueRow[]) {
    if (pick !== 'all' && (r.surface === 'search_ad' ? 'paid' : 'organic') !== pick) continue;
    const cat = bidCapCategoryOf(r, kwCat);
    if (!cat) continue;
    const key = cat.trim().toLowerCase();
    const agg: NetValueAgg = {
      installs: r.installs ?? 0,
      payingShops: r.payingShops ?? 0,
      netValue: r.netValue ?? 0,
      netPerInstall: null,
      thin: false,
      thinReason: '',
    };
    const arr = groups.get(key);
    if (arr) arr.push(agg);
    else groups.set(key, [agg]);
  }
  groups.forEach((items, key) => {
    const sum = sumNetValueAggs(items);
    if (sum) out.set(key, sum);
  });
  return out;
}
