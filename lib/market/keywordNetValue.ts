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
