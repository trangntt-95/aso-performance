import type { NetValueRow, SheetPayload } from '@/lib/sheets/types';
import { normKw } from '@/lib/sheets/kwNorm';

// Một install của keyword này đáng bao nhiêu tiền, và bid tối đa là bao nhiêu.
//
// Tab 'Net value per install' ở grain keyword × nước; gộp về keyword để ghép
// với Underbid, vốn ở grain keyword. Gộp bằng CỘNG rồi chia, không phải lấy
// trung bình các dòng: trung bình cộng cho một nước 1 install cùng trọng số
// với một nước 60 install, và đúng những nước 1 install mới là chỗ có số
// $3.273/install làm lệch cả bảng.
//
// ── Vì sao cần ngưỡng tin cậy ─────────────────────────────────────────────
// Đo trên data thật: 'ltv' ở Japan có 1 install và net value $3.273 — nhưng
// shop lớn nhất trong nhóm đó có 7.614 đơn/30 ngày. Đó là một shop khổng lồ
// tình cờ vào qua keyword ấy, không phải một keyword đáng $3.273 mỗi install.
// Bid theo con số đó là bid theo một lần may. Nên số shop TRẢ TIỀN mới là mẫu
// số của độ tin cậy, không phải số install.

/** Dưới ngần này shop trả tiền thì con số là một lần tung xúc xắc. */
const MIN_PAYING_SHOPS = 3;

/**
 * Hệ số an toàn trong công thức của sheet: Bid = min(NPI × 90% × CR, trần tier).
 *
 * Giữ đúng 90% của sheet thay vì tự chọn số khác — hai chỗ tính ra hai trần
 * khác nhau thì không ai biết nên tin cái nào.
 */
export const BID_SAFETY = 0.9;

export interface KeywordNetValue {
  keyword: string;
  installs: number;
  payingShops: number;
  netValue: number;
  /** netValue ÷ installs, gộp trên mọi nước. */
  netPerInstall: number | null;
  /** Nước đóng nhiều tiền nhất cho keyword này. */
  topCountry: string | null;
  topCountryShare: number;
  countries: number;
  /** Đơn 30 ngày của shop lớn nhất — dấu hiệu giá trị dồn vào một shop. */
  largestShopOrders: number | null;
  /** True khi mẫu quá mỏng để dùng con số này quyết định bid. */
  thin: boolean;
  /** Vì sao mỏng — để hiện thẳng ra chứ không chỉ tô màu. */
  thinReason: string;
}

/** keyword đã chuẩn hoá → giá trị gộp. */
export function buildKeywordNetValue(
  data: SheetPayload | null | undefined,
): Map<string, KeywordNetValue> {
  const out = new Map<string, KeywordNetValue>();
  const rows = data?.netValuePerInstall ?? [];
  if (rows.length === 0) return out;

  interface Acc {
    keyword: string;
    installs: number;
    payingShops: number;
    netValue: number;
    largestShopOrders: number | null;
    byCountry: Map<string, number>;
  }
  const acc = new Map<string, Acc>();
  for (const r of rows as NetValueRow[]) {
    const k = normKw(r.keyword ?? '');
    if (!k) continue;
    let a = acc.get(k);
    if (!a) {
      a = {
        keyword: r.keyword.trim(),
        installs: 0,
        payingShops: 0,
        netValue: 0,
        largestShopOrders: null,
        byCountry: new Map(),
      };
      acc.set(k, a);
    }
    a.installs += r.installs ?? 0;
    a.payingShops += r.payingShops ?? 0;
    a.netValue += r.netValue ?? 0;
    if (r.largestShopOrders !== null && r.largestShopOrders > (a.largestShopOrders ?? 0)) {
      a.largestShopOrders = r.largestShopOrders;
    }
    if (r.country && (r.netValue ?? 0) > 0) {
      a.byCountry.set(r.country, (a.byCountry.get(r.country) ?? 0) + r.netValue);
    }
  }

  acc.forEach((a, k) => {
    let topCountry: string | null = null;
    let topVal = 0;
    a.byCountry.forEach((v, c) => {
      if (v > topVal) {
        topVal = v;
        topCountry = c;
      }
    });
    const thin = a.payingShops < MIN_PAYING_SHOPS;
    out.set(k, {
      keyword: a.keyword,
      installs: a.installs,
      payingShops: a.payingShops,
      netValue: a.netValue,
      netPerInstall: a.installs > 0 ? a.netValue / a.installs : null,
      topCountry,
      topCountryShare: a.netValue > 0 ? topVal / a.netValue : 0,
      countries: a.byCountry.size,
      largestShopOrders: a.largestShopOrders,
      thin,
      thinReason: thin
        ? `chỉ ${a.payingShops} shop trả tiền — dưới ${MIN_PAYING_SHOPS} thì con số này là một lần tung xúc xắc`
        : '',
    });
  });
  return out;
}

/**
 * Trần bid hoà vốn cho một keyword: net value mỗi install × an toàn × CR.
 *
 * CR đổi từ install-mỗi-user thành đơn vị của bid: net value tính trên
 * INSTALL, còn bid trả cho CLICK, nên thiếu bước nhân CR là so hai đơn vị
 * khác nhau — đúng lỗi đã làm màn CPI cap báo 37/40 nước "vượt trần" hồi
 * tháng 8.
 */
export function breakevenBid(
  netPerInstall: number | null | undefined,
  crPct: number | null | undefined,
  safety = BID_SAFETY,
): number | null {
  if (netPerInstall === null || netPerInstall === undefined || !(netPerInstall > 0)) return null;
  if (crPct === null || crPct === undefined || !(crPct > 0)) return null;
  return netPerInstall * safety * (crPct / 100);
}

// ── Gộp theo grain khác: keyword × nước, và nước ─────────────────────────────
//
// Cùng một tab nuôi ba bảng ở ba grain: Underbid ở keyword (trên), Keyword
// Trend ở keyword × nước, Overbid ở nước (camp biết nước mà không biết
// keyword). Ba chỗ dùng chung một cách gộp và một ngưỡng "mỏng", để cùng một
// keyword không hiện đậm ở bảng này mà vàng ở bảng kia.

/** Kênh của install: tab có cột Surface 'search' (organic) / 'search_ad' (paid). */
export type NetValuePick = 'all' | 'organic' | 'paid';

export interface NetValueAgg {
  installs: number;
  payingShops: number;
  netValue: number;
  /** netValue ÷ installs. null khi chưa có install. */
  netPerInstall: number | null;
  /** Dưới MIN_PAYING_SHOPS shop trả tiền — hiện được nhưng không nên bid theo. */
  thin: boolean;
  thinReason: string;
}

interface RawAcc {
  installs: number;
  payingShops: number;
  netValue: number;
}
const newAcc = (): RawAcc => ({ installs: 0, payingShops: 0, netValue: 0 });
const addRow = (a: RawAcc, r: NetValueRow) => {
  a.installs += r.installs ?? 0;
  a.payingShops += r.payingShops ?? 0;
  a.netValue += r.netValue ?? 0;
};
function finish(a: RawAcc): NetValueAgg {
  const thin = a.payingShops < MIN_PAYING_SHOPS;
  return {
    installs: a.installs,
    payingShops: a.payingShops,
    netValue: a.netValue,
    netPerInstall: a.installs > 0 ? a.netValue / a.installs : null,
    thin,
    thinReason: thin
      ? `chỉ ${a.payingShops} shop trả tiền — dưới ${MIN_PAYING_SHOPS} thì con số này là một lần tung xúc xắc`
      : '',
  };
}
const pickOf = (r: NetValueRow): Exclude<NetValuePick, 'all'> =>
  r.surface === 'search_ad' ? 'paid' : 'organic';

/** Một ô keyword × nước, tách theo kênh để khớp bộ lọc all/organic/paid của bảng. */
export type NetValueByPick = Record<NetValuePick, NetValueAgg | null>;

/**
 * keyword đã chuẩn hoá → nước → giá trị theo kênh.
 *
 * Grain gốc của tab, không gộp gì thêm — đây là chỗ duy nhất trả lời
 * "keyword này ở nước này đáng bao nhiêu". Hầu hết ô sẽ mỏng (đo 11/09/2026:
 * 35/1015 dòng có ≥3 shop trả tiền), nên bảng nào dùng phải hiện nhãn mỏng.
 */
export function buildKeywordCountryNetValue(
  data: SheetPayload | null | undefined,
): Map<string, Map<string, NetValueByPick>> {
  const out = new Map<string, Map<string, NetValueByPick>>();
  const rows = data?.netValuePerInstall ?? [];
  if (rows.length === 0) return out;
  type Cell = Record<NetValuePick, RawAcc | null>;
  const acc = new Map<string, Map<string, Cell>>();
  for (const r of rows as NetValueRow[]) {
    const k = normKw(r.keyword ?? '');
    const country = (r.country ?? '').trim();
    if (!k || !country) continue;
    let byCountry = acc.get(k);
    if (!byCountry) {
      byCountry = new Map();
      acc.set(k, byCountry);
    }
    let cell = byCountry.get(country);
    if (!cell) {
      cell = { all: newAcc(), organic: null, paid: null };
      byCountry.set(country, cell);
    }
    addRow(cell.all!, r);
    const p = pickOf(r);
    if (!cell[p]) cell[p] = newAcc();
    addRow(cell[p]!, r);
  }
  acc.forEach((byCountry, k) => {
    const m = new Map<string, NetValueByPick>();
    byCountry.forEach((cell, country) => {
      m.set(country, {
        all: cell.all ? finish(cell.all) : null,
        organic: cell.organic ? finish(cell.organic) : null,
        paid: cell.paid ? finish(cell.paid) : null,
      });
    });
    out.set(k, m);
  });
  return out;
}

/**
 * nước → giá trị gộp trên mọi keyword, theo kênh đã chọn.
 *
 * Dùng cho bảng ở grain camp: camp biết mình chạy nước nào (Camp_Links) mà
 * không biết keyword nào, nên giá trị install của camp = giá trị install của
 * các nước nó chạy. Mặc định 'paid' vì camp chỉ mua install paid.
 */
export function buildCountryNetValue(
  data: SheetPayload | null | undefined,
  pick: NetValuePick = 'paid',
): Map<string, NetValueAgg> {
  const out = new Map<string, NetValueAgg>();
  const rows = data?.netValuePerInstall ?? [];
  if (rows.length === 0) return out;
  const acc = new Map<string, RawAcc>();
  for (const r of rows as NetValueRow[]) {
    const country = (r.country ?? '').trim();
    if (!country) continue;
    if (pick !== 'all' && pickOf(r) !== pick) continue;
    let a = acc.get(country);
    if (!a) {
      a = newAcc();
      acc.set(country, a);
    }
    addRow(a, r);
  }
  acc.forEach((a, country) => out.set(country, finish(a)));
  return out;
}

/**
 * Giá trị install gộp trên một TẬP nước — cho camp chạy nhiều nước.
 *
 * Gộp bằng CỘNG installs và net value rồi chia, không lấy trung bình các
 * nước: nước 1 install không được nặng bằng nước 60 install. `countries`
 * rỗng (camp 'all') → gộp toàn bộ.
 */
export function sumCountryNetValue(
  byCountry: Map<string, NetValueAgg>,
  countries: readonly string[],
  mode: 'include' | 'exclude' | 'all' = 'include',
): NetValueAgg | null {
  const wanted = new Set(countries.map((c) => c.toLowerCase()));
  const a = newAcc();
  let any = false;
  byCountry.forEach((v, country) => {
    const hit = wanted.has(country.toLowerCase());
    if (mode === 'include' && !hit) return;
    if (mode === 'exclude' && hit) return;
    a.installs += v.installs;
    a.payingShops += v.payingShops;
    a.netValue += v.netValue;
    any = true;
  });
  return any ? finish(a) : null;
}

/**
 * keyword đã chuẩn hoá → giá trị theo kênh, gộp mọi nước.
 *
 * Cho bảng có một dòng cho mỗi keyword × surface (Categories): dòng organic
 * phải hiện giá trị của install organic, dòng paid của install paid — hai con
 * số này lệch nhau thật (install paid thường rẻ giá trị hơn), gộp chung sẽ
 * tô hồng cả hai dòng bằng một số không thuộc dòng nào.
 */
export function buildKeywordNetValueByPick(
  data: SheetPayload | null | undefined,
): Map<string, NetValueByPick> {
  const out = new Map<string, NetValueByPick>();
  const rows = data?.netValuePerInstall ?? [];
  if (rows.length === 0) return out;
  type Cell = Record<NetValuePick, RawAcc | null>;
  const acc = new Map<string, Cell>();
  for (const r of rows as NetValueRow[]) {
    const k = normKw(r.keyword ?? '');
    if (!k) continue;
    let cell = acc.get(k);
    if (!cell) {
      cell = { all: newAcc(), organic: null, paid: null };
      acc.set(k, cell);
    }
    addRow(cell.all!, r);
    const p = pickOf(r);
    if (!cell[p]) cell[p] = newAcc();
    addRow(cell[p]!, r);
  }
  acc.forEach((cell, k) => {
    out.set(k, {
      all: cell.all ? finish(cell.all) : null,
      organic: cell.organic ? finish(cell.organic) : null,
      paid: cell.paid ? finish(cell.paid) : null,
    });
  });
  return out;
}

/** Gộp nhiều NetValueAgg (ví dụ mọi keyword của một category) thành một. */
export function sumNetValueAggs(items: readonly (NetValueAgg | null | undefined)[]): NetValueAgg | null {
  const a = newAcc();
  let any = false;
  for (const v of items) {
    if (!v) continue;
    a.installs += v.installs;
    a.payingShops += v.payingShops;
    a.netValue += v.netValue;
    any = true;
  }
  return any ? finish(a) : null;
}
