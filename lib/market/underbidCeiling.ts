import type { BidCapRow, CampLinkRow, MasterKwRow, SheetPayload } from '@/lib/sheets/types';
import { aggregateBidCapCells, bidCapCellsByCategory, getBidCapCell, type BidCapCell } from '@/lib/market/bidCapAgg';
import { buildCampGeoIndex, isNeverTargeted, type CampGeo } from '@/lib/sheets/campGeo';
import { buildCampLinkResolver, normalizeCampName } from '@/lib/sheets/campName';
import { BID_SAFETY, buildKeywordCountryNetValue } from '@/lib/market/keywordNetValue';
import { normKw } from '@/lib/sheets/kwNorm';

// Trần bid của một keyword ở Underbid — tính THEO TỪNG CAMP đang bid keyword,
// trên đúng các nước camp đó target, cùng công thức và cùng mốc với Overbid.
//
// Bản cũ lấy net value của keyword gộp mọi nước, cả hai kênh, nhân CR organic,
// không chặn trần tier. So với Bid Rec của sheet (NPI theo Country × Category,
// CR paid của ô, chặn Tier ceil) nó lệch 2–4 lần cho cùng một keyword — "ltv"
// ra $53 vì một install paid ở Nhật trị giá $3.273, trong khi Nhật có trần tier
// $15. Underbid bảo còn chỗ nâng, Overbid bảo đã vượt, và Trang phải tự đoán
// bảng nào đúng (15/09/2026).
//
// Vì sao theo camp chứ không theo keyword: bid được set theo keyword × camp, và
// camp là thứ có geo. Bản thử đầu hợp geo của mọi camp rồi trung bình một lần —
// một keyword nằm trong 8 camp phủ 35 nước ra trần ~$19 cho mọi keyword, Tier 1
// kéo lên, 40/47 dòng "còn chỗ nâng" trong khi Overbid đang đỏ camp ES của
// chính keyword đó. Tính theo camp thì trần của camp ES ở đây bằng đúng "bid
// cho phép" của camp ES bên Overbid.
//
// Mỗi nước target của camp tính một bid:
//   value  = giá trị install PAID của keyword × nước khi đủ 3 shop trả tiền,
//            không thì NPI Country × Category của sheet;
//   CR     = 'CR used' của ô sheet, không có thì CR organic của keyword;
//   bid_c  = min(value × 90% × CR, Tier ceil của nước).
// Trần camp = trung bình bid_c. Nước target theo Geo của camp, đúng luật
// Overbid: include → đúng các nước đó; exclude → mọi nước của category trừ
// nước loại và trừ nước tài khoản không bao giờ target; trống/all → mọi nước
// của category trừ nước không target.

export interface CeilingCountry {
  country: string;
  /** Giá trị một install paid ở nước này, đã chọn nguồn. */
  value: number;
  valueSource: 'keyword' | 'sheet';
  /** CR dùng để quy install ra click, phân số 0–1. */
  cr: number;
  crSource: 'sheet' | 'organic';
  /** Trần tier của nước; null khi sheet không ghi. */
  tierCeiling: number | null;
  /** value × 90% × CR, trước khi chặn. */
  raw: number;
  /** Bid sau khi chặn trần tier. */
  bid: number;
  capped: boolean;
}

/** Bid đang set so trần — nhãn cho bảng. */
export type CeilingVerdict = 'room' | 'at-ceiling' | 'over' | 'unknown';

export interface CampCeiling {
  camp: string;
  /** Trung bình bid các nước target của camp; null khi không nước nào tính được. */
  ceiling: number | null;
  countries: CeilingCountry[];
  /** Nước target nhưng không đủ dữ liệu (không có ô sheet và keyword chưa đủ 3 shop). */
  skipped: string[];
  /** Nước lấy theo Geo camp ('geo') hay mọi nước của category ('category'). */
  scope: 'geo' | 'category';
  /** Bid (max) của keyword trong camp này, Master KW Lookup. */
  bidNow: number | null;
  verdict: CeilingVerdict;
}

export interface KeywordCeiling {
  camps: CampCeiling[];
  /** Trần thấp nhất / cao nhất trong các camp tính được; null khi không camp nào. */
  ceilingMin: number | null;
  ceilingMax: number | null;
  /** Bid đang set cao nhất trong các camp. */
  bidNow: number | null;
  /** Đếm nhãn theo camp — dòng keyword đọc "2 còn chỗ · 1 vượt". */
  counts: Record<CeilingVerdict, number>;
  /** Nhãn gộp cho dòng: 'over' nếu có camp vượt, rồi 'at-ceiling', rồi 'room'. */
  verdict: CeilingVerdict;
}

export interface CeilingInput {
  term: string;
  category: string;
  /** Camp đang bid keyword (tên như Master KW Lookup). */
  camps: readonly string[];
  /** CR organic của keyword, phân số — đường lùi khi ô sheet không có CR used. */
  organicCr: number | null;
}

export interface UnderbidCeilingIndex {
  compute(input: CeilingInput): KeywordCeiling;
}

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;

const parseBid = (raw: string): number | null => {
  const n = Number(String(raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Sheet gọi 'Brand', keyword tab cũng 'Brand'; chỉ chuẩn hoá biến thể. */
function sheetCategory(raw: string): string {
  const k = (raw ?? '').trim().toLowerCase();
  if (k.startsWith('brand')) return 'Brand';
  return (raw ?? '').trim();
}

export function verdictOf(ceiling: number | null, bidNow: number | null): CeilingVerdict {
  if (ceiling === null || bidNow === null) return 'unknown';
  if (bidNow > ceiling * 1.1) return 'over';
  if (bidNow >= ceiling * 0.9) return 'at-ceiling';
  return 'room';
}

export function buildUnderbidCeilingIndex(
  data: Pick<SheetPayload, 'bidCap' | 'campLinks' | 'masterKwLookup' | 'netValuePerInstall'> | null | undefined,
): UnderbidCeilingIndex {
  const bidCap: BidCapRow[] = data?.bidCap ?? [];
  const campLinks: CampLinkRow[] = data?.campLinks ?? [];
  const master: MasterKwRow[] = data?.masterKwLookup ?? [];

  const cells = aggregateBidCapCells(bidCap);
  const byCat = bidCapCellsByCategory(cells);
  // Hàm này chỉ đọc netValuePerInstall; ép kiểu để nhận bản payload rút gọn.
  const kwCountry = buildKeywordCountryNetValue((data ?? null) as SheetPayload | null);

  // Geo theo tên chuẩn hoá, và resolver để tên camp trong Master (có thể mang
  // tag) về tên Camp_Links.
  const geoRaw = buildCampGeoIndex(campLinks);
  const geo = new Map<string, CampGeo>();
  geoRaw.forEach((g, name) => {
    const k = normalizeCampName(name).toLowerCase();
    const cur = geo.get(k);
    if (!cur || (cur.mode === 'unknown' && g.mode !== 'unknown')) geo.set(k, g);
  });
  const resolver = buildCampLinkResolver(campLinks);
  const geoOf = (camp: string): CampGeo | undefined => {
    const base = resolver.resolve(camp) ?? camp;
    return geo.get(normalizeCampName(base).toLowerCase());
  };

  // keyword → camp → bid (max) đang set.
  const bidsByKw = new Map<string, Map<string, number>>();
  for (const m of master) {
    const b = parseBid(m.bidMax);
    if (b === null) continue;
    const k = normKw(m.keyword);
    let byCamp = bidsByKw.get(k);
    if (!byCamp) {
      byCamp = new Map();
      bidsByKw.set(k, byCamp);
    }
    const ck = normalizeCampName(m.camp).toLowerCase();
    byCamp.set(ck, Math.max(byCamp.get(ck) ?? 0, b));
  }

  /** Nước target của một camp, theo Geo của nó. */
  const targetsOf = (camp: string | null, general: readonly string[]): { countries: string[]; scope: 'geo' | 'category' } => {
    const g = camp ? geoOf(camp) : undefined;
    if (g && g.mode === 'include' && g.countries.length > 0) return { countries: g.countries, scope: 'geo' };
    if (g && g.mode === 'exclude' && g.countries.length > 0) {
      const ex = new Set(g.countries);
      return { countries: general.filter((c) => !ex.has(c)), scope: 'geo' };
    }
    return { countries: [...general], scope: 'category' };
  };

  /** Một bid cho một nước, hoặc null khi không đủ dữ liệu. */
  const bidFor = (
    term: string,
    category: string,
    country: string,
    organicCr: number | null,
  ): CeilingCountry | null => {
    const cell = getBidCapCell(cells, country, category);
    const kwPaid = kwCountry.get(normKw(term))?.get(country)?.paid ?? null;

    let value: number | null = null;
    let valueSource: 'keyword' | 'sheet' = 'sheet';
    if (kwPaid && !kwPaid.thin && kwPaid.netPerInstall !== null && kwPaid.netPerInstall > 0) {
      value = kwPaid.netPerInstall;
      valueSource = 'keyword';
    } else if (cell && cell.npi > 0) {
      value = cell.npi;
    }

    let cr: number | null = null;
    let crSource: 'sheet' | 'organic' = 'sheet';
    if (cell && cell.crUsedPct > 0) cr = cell.crUsedPct / 100;
    else if (organicCr !== null && organicCr > 0) {
      cr = organicCr;
      crSource = 'organic';
    }
    if (value === null || cr === null) return null;

    const tierCeiling = cell && cell.tierCeiling > 0 ? cell.tierCeiling : null;
    const raw = value * BID_SAFETY * cr;
    const capped = tierCeiling !== null && raw > tierCeiling;
    return { country, value, valueSource, cr, crSource, tierCeiling, raw, bid: capped ? (tierCeiling as number) : raw, capped };
  };

  const compute = (input: CeilingInput): KeywordCeiling => {
    const category = sheetCategory(input.category);
    const catCells: BidCapCell[] = byCat.get(category) ?? [];
    const general = catCells.filter((c) => !isNeverTargeted(c.country)).map((c) => c.country).sort();
    const bidByCamp = bidsByKw.get(normKw(input.term));

    const campOne = (camp: string | null): CampCeiling => {
      const { countries: targets, scope } = targetsOf(camp, general);
      const countries: CeilingCountry[] = [];
      const skipped: string[] = [];
      for (const country of [...targets].sort()) {
        const b = bidFor(input.term, category, country, input.organicCr);
        if (b) countries.push(b);
        else skipped.push(country);
      }
      const ceiling = mean(countries.map((c) => c.bid));
      const bidNow = camp ? bidByCamp?.get(normalizeCampName(camp).toLowerCase()) ?? null : null;
      return { camp: camp ?? '(chưa bid)', ceiling, countries, skipped, scope, bidNow, verdict: verdictOf(ceiling, bidNow) };
    };

    // Chưa bid ở đâu: một dòng "camp" ảo trên mọi nước của category, để vẫn có
    // trần tham khảo khi mở bid mới.
    const camps = input.camps.length > 0 ? input.camps.map((c) => campOne(c)) : [campOne(null)];
    // Vượt trần lên trước — đó là dòng cần đọc trước khi tăng gì.
    const order: Record<CeilingVerdict, number> = { over: 0, 'at-ceiling': 1, room: 2, unknown: 3 };
    camps.sort((a, b) => order[a.verdict] - order[b.verdict] || (b.bidNow ?? 0) - (a.bidNow ?? 0));

    const ceilings = camps.map((c) => c.ceiling).filter((x): x is number => x !== null);
    const bids = camps.map((c) => c.bidNow).filter((x): x is number => x !== null);
    const counts: Record<CeilingVerdict, number> = { room: 0, 'at-ceiling': 0, over: 0, unknown: 0 };
    for (const c of camps) counts[c.verdict] += 1;
    const verdict: CeilingVerdict =
      counts.over > 0 ? 'over' : counts['at-ceiling'] > 0 ? 'at-ceiling' : counts.room > 0 ? 'room' : 'unknown';

    return {
      camps,
      ceilingMin: ceilings.length ? Math.min(...ceilings) : null,
      ceilingMax: ceilings.length ? Math.max(...ceilings) : null,
      bidNow: bids.length ? Math.max(...bids) : null,
      counts,
      verdict,
    };
  };

  return { compute };
}
