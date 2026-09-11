import type {
  BidCapRow,
  CampLinkRow,
  KeywordRow,
  MasterKwRow,
  ShopifyDailyRow,
} from '@/lib/sheets/types';
import { buildCampGeoIndex, type CampGeo } from '@/lib/sheets/campGeo';
import { buildCampNameResolver, normalizeCampName } from '@/lib/sheets/campName';
import { canonicalCategoriesFor } from '@/lib/market/categoryTaxonomy';
import { aggregateBidCapCells, bidCapCellsByCategory } from '@/lib/market/bidCapAgg';

// Camp brand đã đứng top rồi mà vẫn trả bid cao — tiền đó không mua thêm vị
// trí nào nữa.
//
// Shopify Ads báo 'Average Position' và 'Visibility' cho từng camp mỗi ngày
// trong export theo ngày (cột U, V của tab per-day). Camp brand ở vị trí 1.0–1.5
// với visibility ~100% nghĩa là đã chiếm chỗ cao nhất có thể; bid thêm chỉ
// làm CPC đắt hơn cho cùng một vị trí. Đây là cảnh báo "hạ bid" ngược chiều
// với Underbid (cần bid thêm để lên top).
//
// Vị trí ở grain CAMP, không phải nước: một camp phủ nhiều nước thì con số là
// trung bình gia quyền theo impressions trên các nước đó. Nước của camp lấy từ
// Geo trong Camp_Links để người đọc biết đang nói thị trường nào, và vị trí
// ORGANIC của brand ở các nước đó (Country_L30) đặt cạnh để thấy có đang trả
// tiền cho vị trí mà organic đã có sẵn hay không.

export interface BrandTopParams {
  /** Cửa sổ ngày, neo vào ngày mới nhất có trong export. Mặc định 14. */
  days?: number;
  /** Vị trí trung bình từ mức này trở xuống coi là đã top. Mặc định 1.5. */
  maxPos?: number;
  /** Dưới ngần này impressions trong cửa sổ thì vị trí chỉ là vài lần hiển thị. Mặc định 20. */
  minImpressions?: number;
  /** Visibility (tỷ lệ phiên có hiển thị) từ mức này trở lên mới coi là chiếm chỗ chắc. Mặc định 0.8. */
  minVisibility?: number;
}

export type BrandTopVerdict =
  | 'top' // đã top, vis cao → hạ bid
  | 'watch' // gần top (trong +0.5) hoặc top nhưng vis chưa chắc
  | 'ok' // còn xa top — bid đang mua vị trí thật
  | 'low-data' // quá ít impressions để tin vị trí
  | 'no-position'; // export không có cột vị trí cho camp này trong cửa sổ

export interface BrandTopRow {
  camp: string;
  url?: string;
  /** Nước từ Geo (Camp_Links). Rỗng khi camp chạy mọi nước / không có Geo. */
  countries: string[];
  geoMode: CampGeo['mode'];
  countryLabel: string;
  impressions: number;
  clicks: number;
  installs: number;
  spend: number;
  cpi: number | null;
  /** Trung bình gia quyền theo impressions trên các ngày có vị trí. */
  position: number | null;
  visibility: number | null;
  daysWithPosition: number;
  daysActive: number;
  /** Median 'Bid (max)' của các keyword camp này trong Master KW Lookup. */
  bidNow: number | null;
  /** Trung bình Bid Rec ⭐ của ô Brand × các nước camp target ('Max bid cap'). */
  bidRec: number | null;
  /** Vị trí organic của brand ở các nước đó (Country_L30, gia quyền theo users). */
  organicPos: number | null;
  organicUsers: number;
  verdict: BrandTopVerdict;
  reason: string;
}

export interface BrandTopResult {
  rows: BrandTopRow[];
  from: string;
  to: string;
  /** False khi không dòng nào trong cửa sổ có vị trí — export chưa mang cột U/V. */
  hasPosition: boolean;
  brandCamps: number;
}

const isBrandLink = (c: CampLinkRow): boolean =>
  canonicalCategoriesFor(c.category).includes('Brand') || /brand/i.test(c.camp);

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function findBrandTopCamps(
  daily: ShopifyDailyRow[],
  campLinks: CampLinkRow[],
  master: MasterKwRow[],
  pausedCamps: MasterKwRow[],
  bidCap: BidCapRow[],
  countryRows: KeywordRow[],
  params: BrandTopParams = {},
): BrandTopResult {
  const days = params.days ?? 14;
  const maxPos = params.maxPos ?? 1.5;
  const minImp = params.minImpressions ?? 20;
  const minVis = params.minVisibility ?? 0.8;
  const empty: BrandTopResult = { rows: [], from: '', to: '', hasPosition: false, brandCamps: 0 };
  if (!daily || daily.length === 0) return empty;

  // Cửa sổ neo vào ngày mới nhất có data, như campTotalsFromDaily.
  let to = '';
  for (const r of daily) if (r.date > to) to = r.date;
  if (!to) return empty;
  const anchor = new Date(`${to}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - (days - 1));
  const from = anchor.toISOString().slice(0, 10);

  const linkResolver = buildCampNameResolver(campLinks.map((c) => c.camp));
  const pausedResolver = buildCampNameResolver(pausedCamps.map((p) => p.camp));
  const masterResolver = buildCampNameResolver(master.map((m) => m.camp));
  const linkByKey = new Map<string, CampLinkRow>();
  for (const c of campLinks) {
    const k = normalizeCampName(c.camp).toLowerCase();
    if (!linkByKey.has(k)) linkByKey.set(k, c);
  }
  const geoRaw = buildCampGeoIndex(campLinks);
  const geoByKey = new Map<string, CampGeo>();
  geoRaw.forEach((g, name) => {
    const k = normalizeCampName(name).toLowerCase();
    const cur = geoByKey.get(k);
    if (!cur || (cur.mode === 'unknown' && g.mode !== 'unknown')) geoByKey.set(k, g);
  });

  // Bid hiện tại theo camp: median Bid (max) của keyword trong Master.
  const bidsByMasterKey = new Map<string, number[]>();
  for (const m of master) {
    const bid = Number(m.bidMax);
    if (!Number.isFinite(bid) || bid <= 0) continue;
    const k = normalizeCampName(m.camp).toLowerCase();
    const arr = bidsByMasterKey.get(k);
    if (arr) arr.push(bid);
    else bidsByMasterKey.set(k, [bid]);
  }

  // Bid Rec ⭐ của Brand theo nước.
  const brandCells = bidCapCellsByCategory(aggregateBidCapCells(bidCap)).get('Brand') ?? [];
  const brandBidByCountry = new Map<string, number>();
  for (const c of brandCells) if (c.bid > 0) brandBidByCountry.set(c.country.toLowerCase(), c.bid);

  // Vị trí organic của brand theo nước.
  const organicByCountry = new Map<string, { posUsers: number; users: number }>();
  for (const r of countryRows) {
    if (r.surface === 'search_ad' || r.category !== 'Brand' || !r.country) continue;
    if (r.posL === null || r.posL === undefined || !(r.usersL > 0)) continue;
    const k = r.country.toLowerCase();
    const a = organicByCountry.get(k) ?? { posUsers: 0, users: 0 };
    a.posUsers += r.posL * r.usersL;
    a.users += r.usersL;
    organicByCountry.set(k, a);
  }

  interface Acc {
    camp: string;
    key: string;
    impressions: number;
    clicks: number;
    installs: number;
    spend: number;
    posImp: number;
    visImp: number;
    impWithPos: number;
    daysWithPosition: number;
    days: Set<string>;
  }
  const acc = new Map<string, Acc>();
  let anyPosition = false;
  for (const r of daily) {
    if (r.date < from || r.date > to) continue;
    const resolved = linkResolver.resolve(r.camp);
    const key = (resolved ?? normalizeCampName(r.camp)).toLowerCase();
    const link = linkByKey.get(key);
    const brand = link ? isBrandLink(link) : /brand/i.test(r.camp);
    if (!brand) continue;
    if (pausedResolver.resolve(r.camp) !== null) continue;
    let a = acc.get(key);
    if (!a) {
      a = {
        camp: link?.camp ?? r.camp,
        key,
        impressions: 0,
        clicks: 0,
        installs: 0,
        spend: 0,
        posImp: 0,
        visImp: 0,
        impWithPos: 0,
        daysWithPosition: 0,
        days: new Set(),
      };
      acc.set(key, a);
    }
    // Tên ngắn nhất là tên gần với tên gốc nhất (ghi chú chỉ làm tên dài ra).
    if (!link && r.camp.length < a.camp.length) a.camp = r.camp;
    a.impressions += r.impressions;
    a.clicks += r.clicks;
    a.installs += r.installs;
    a.spend += r.spend;
    a.days.add(r.date);
    if (r.position !== null && r.position !== undefined && r.position > 0 && r.impressions > 0) {
      anyPosition = true;
      a.posImp += r.position * r.impressions;
      a.visImp += (r.visibility ?? 0) * r.impressions;
      a.impWithPos += r.impressions;
      a.daysWithPosition++;
    }
  }

  const rows: BrandTopRow[] = [];
  acc.forEach((a) => {
    const geo = geoByKey.get(a.key) ?? { mode: 'unknown' as const, countries: [] };
    const countries = geo.mode === 'include' ? geo.countries : [];
    const countryLabel =
      geo.mode === 'include'
        ? geo.countries.join(', ')
        : geo.mode === 'exclude'
          ? `mọi nước trừ ${geo.countries.join(', ')}`
          : geo.mode === 'all'
            ? 'mọi nước'
            : 'không rõ Geo';

    const position = a.impWithPos > 0 ? a.posImp / a.impWithPos : null;
    const visibility = a.impWithPos > 0 ? a.visImp / a.impWithPos : null;

    const masterKey = (masterResolver.resolve(a.camp) ?? normalizeCampName(a.camp)).toLowerCase();
    const bidNow = median(bidsByMasterKey.get(masterKey) ?? []);

    const wanted = new Set(countries.map((c) => c.toLowerCase()));
    const excluded = new Set(geo.mode === 'exclude' ? geo.countries.map((c) => c.toLowerCase()) : []);
    const recBids: number[] = [];
    brandBidByCountry.forEach((bid, country) => {
      if (wanted.size > 0 ? wanted.has(country) : !excluded.has(country)) recBids.push(bid);
    });
    const bidRec = recBids.length ? recBids.reduce((s, x) => s + x, 0) / recBids.length : null;

    let posUsers = 0;
    let users = 0;
    organicByCountry.forEach((o, country) => {
      if (wanted.size > 0 ? wanted.has(country) : !excluded.has(country)) {
        posUsers += o.posUsers;
        users += o.users;
      }
    });
    const organicPos = users > 0 ? posUsers / users : null;

    let verdict: BrandTopVerdict;
    let reason: string;
    if (a.impressions < minImp) {
      verdict = 'low-data';
      reason = `chỉ ${a.impressions} impressions trong ${days} ngày — vị trí chưa đủ tin`;
    } else if (position === null) {
      verdict = 'no-position';
      reason = 'export không có Average Position cho camp này';
    } else if (position <= maxPos && (visibility ?? 0) >= minVis) {
      verdict = 'top';
      reason = `đã ở vị trí ${position.toFixed(2)} với visibility ${Math.round((visibility ?? 0) * 100)}% — bid thêm không mua thêm vị trí`;
    } else if (position <= maxPos + 0.5) {
      verdict = 'watch';
      reason =
        position <= maxPos
          ? `vị trí ${position.toFixed(2)} nhưng visibility mới ${Math.round((visibility ?? 0) * 100)}% — chưa chiếm chỗ chắc`
          : `vị trí ${position.toFixed(2)}, sát top — theo dõi`;
    } else {
      verdict = 'ok';
      reason = `vị trí ${position.toFixed(2)} — bid đang mua vị trí thật`;
    }

    rows.push({
      camp: a.camp,
      url: linkByKey.get(a.key)?.url || undefined,
      countries,
      geoMode: geo.mode,
      countryLabel,
      impressions: a.impressions,
      clicks: a.clicks,
      installs: a.installs,
      spend: a.spend,
      cpi: a.installs > 0 ? a.spend / a.installs : null,
      position,
      visibility,
      daysWithPosition: a.daysWithPosition,
      daysActive: a.days.size,
      bidNow,
      bidRec,
      organicPos,
      organicUsers: users,
      verdict,
      reason,
    });
  });

  const rank: Record<BrandTopVerdict, number> = { top: 0, watch: 1, ok: 2, 'low-data': 3, 'no-position': 4 };
  rows.sort((x, y) => rank[x.verdict] - rank[y.verdict] || y.spend - x.spend || y.impressions - x.impressions);
  return { rows, from, to, hasPosition: anyPosition, brandCamps: rows.length };
}
