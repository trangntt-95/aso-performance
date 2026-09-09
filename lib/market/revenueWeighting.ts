import type {
  ChannelMetrics,
  DynamicBasketItem,
  FunnelBreakdown,
  KeywordRow,
  SheetPayload,
  Window,
  WowMetric,
} from '@/lib/sheets/types';
import { normCountryToken } from '@/lib/sheets/campGeo';

// Cân mọi số trong Market Health theo doanh thu của nước sinh ra nó.
//
// Trọng số cũ của sheet là "organic search users của nước đó ÷ của nước lớn
// nhất": cân theo mức độ chú ý, không theo tiền. Data hiện tại cho thấy khoảng
// lệch không nhỏ — India 6.4% users nhưng 0.1% doanh thu ($3.98/install),
// Vietnam 5.0% users và $0, còn Hong Kong 0.3% users lại là 4.1% doanh thu.
// Một verdict "market down" cân theo users có thể chỉ đang mô tả những nước gần
// như không sinh tiền.
//
// Ở đây weight = doanh thu nước đó ÷ tổng doanh thu trong block RAW DATA của
// PerGeo_CPI_Cap. Chia cho tổng hay chia cho nước lớn nhất đều cho ra CÙNG một
// delta % (khác nhau đúng một hằng số), nên chọn share vì nó đọc được thành
// phần trăm.
//
// Hệ quả phải nói thẳng: US chiếm 48% doanh thu, nên chỉ số cân theo doanh thu
// về cơ bản là chỉ số của US cộng thêm một ít. Đó đúng là ý muốn — nước nào
// nhiều tiền thì nặng — nhưng người đọc cần biết mình đang xem cái gì, nên
// thành phần đóng góp luôn được liệt kê ra.

/**
 * Chỉ số cân theo doanh thu chạy trên tab Country_L*, và tab đó **hầu hết là
 * dòng paid**: L90 có 2708 dòng paid so với 292 dòng organic. Đo riêng organic
 * thì L3 chỉ còn 4 users trên tổng 21 users organic thật (19%) — không đủ để
 * kết luận gì. Nên phạm vi mặc định là CẢ HAI surface; tách organic/paid chỉ
 * dùng ở bảng funnel, nơi việc tách là chủ đích và coverage được ghi kèm.
 */
export type WeightScope = 'all' | 'organic' | 'paid';

/** Dưới ngưỡng này thì phần lớn traffic nằm ngoài chỉ số — không trích delta. */
const MIN_COVERAGE = 0.5;

/**
 * Nước phải có bao nhiêu users mới được đem ra so users-vs-doanh-thu.
 *
 * Một nước 2 users lệch bao nhiêu cũng không nói lên điều gì, mà lại chiếm chỗ
 * của nước thật sự đang lệch.
 */
const MIN_MISMATCH_USERS = 10;

/** Lệch từ mức này mới đáng gọi tên (share users ÷ share doanh thu). */
const MISMATCH_RATIO = 2.5;

export interface CountryRevenue {
  country: string;
  revenue: number;
  /** revenue ÷ tổng doanh thu trong block. Đây chính là weight. */
  share: number;
  /** Doanh thu ÷ install — một install ở nước này đáng bao nhiêu. */
  valuePerInstall: number | null;
  rank: number | null;
}

export interface RevenueWeights {
  byKey: Map<string, CountryRevenue>;
  totalRevenue: number;
  /** Kỳ của block doanh thu, ví dụ 'tháng 5-8'. */
  period: string;
  /** Số nước có doanh thu > 0. */
  count: number;
  /** Nước doanh thu lớn nhất — để nói rõ chỉ số đang bị nước nào chi phối. */
  top: CountryRevenue | null;
  weightOf(country: string | undefined): number;
  infoOf(country: string | undefined): CountryRevenue | null;
}

/**
 * Tên nước → key mà hai nguồn đều đồng ý.
 *
 * Cần thật, không phải phòng xa. Country_L* ghi 'Türkiye' còn block doanh thu
 * ghi 'Turkey'; ghép bằng chuỗi thô là mất $5.070 và 70 users trong im lặng —
 * đúng loại loại-trừ mà module này lẽ ra phải phơi ra chứ không tự gây ra.
 *
 * normCountryToken giải quyết những tên nó biết và trả nguyên tên nó không
 * biết, nên hai cách viết của cùng một nước lạ vẫn phải fold ở đây:
 * 'Côte d’Ivoire' so với "cote d'ivoire" lệch cả dấu ô lẫn dấu nháy cong.
 * Không có hai nước thật nào chỉ khác nhau ở dấu, nên fold dấu không thể gộp
 * hai thị trường khác nhau lại.
 */
export function countryKey(raw: string | undefined): string {
  const canon = normCountryToken(String(raw ?? '')) ?? raw ?? '';
  return String(canon)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** GA4 để lại '(not set)' cho traffic không quy được về nước nào. */
const isNotSet = (c: string | undefined): boolean => /^\(not set\)$/i.test((c ?? '').trim());

export function buildRevenueWeights(data: SheetPayload | null | undefined): RevenueWeights | null {
  if (!data) return null;
  const rows = data.perGeoRevenue ?? [];
  const withMoney = rows.filter((r) => r.country && r.revenue > 0);
  if (withMoney.length === 0) return null;

  const totalRevenue = withMoney.reduce((s, r) => s + r.revenue, 0);
  if (!(totalRevenue > 0)) return null;

  const byKey = new Map<string, CountryRevenue>();
  let top: CountryRevenue | null = null;
  for (const r of withMoney) {
    const info: CountryRevenue = {
      country: r.country,
      revenue: r.revenue,
      share: r.revenue / totalRevenue,
      valuePerInstall: r.valuePerInstall && r.valuePerInstall > 0 ? r.valuePerInstall : null,
      // 88 trong 140 dòng của block không có rank; cell parse ra 0 và `0 ?? x`
      // vẫn là 0, để nguyên thì chúng sắp trước United States.
      rank: r.rank > 0 ? r.rank : null,
    };
    const k = countryKey(r.country);
    const cur = byKey.get(k);
    if (!cur || info.revenue > cur.revenue) byKey.set(k, info);
    if (!top || info.revenue > top.revenue) top = info;
  }

  return {
    byKey,
    totalRevenue,
    period: data.perGeoRevenuePeriod ?? '',
    count: byKey.size,
    top,
    weightOf: (country) => byKey.get(countryKey(country))?.share ?? 0,
    infoOf: (country) => byKey.get(countryKey(country)) ?? null,
  };
}

// ── Đọc tab Country_L* ────────────────────────────────────────────────────────

const ALL_TAB: Record<string, keyof SheetPayload> = {
  L3: 'allL3',
  L7: 'allL7',
  L14: 'allL14',
  L30: 'allL30',
  L90: 'allL90',
};

const COUNTRY_TAB: Record<string, keyof SheetPayload> = {
  L3: 'countryL3',
  L7: 'countryL7',
  L14: 'countryL14',
  L30: 'countryL30',
  L90: 'countryL90',
};

/** Dòng Country_L* của một window, đã lọc surface và bỏ '(not set)'. */
export function countryRows(
  data: SheetPayload | null | undefined,
  window: Window,
  scope: WeightScope = 'all',
): KeywordRow[] {
  const key = COUNTRY_TAB[window];
  if (!data || !key) return [];
  const rows = (data[key] as KeywordRow[] | undefined) ?? [];
  return rows.filter((r) => {
    if (!r.country || isNotSet(r.country)) return false;
    if (scope === 'organic') return r.surface !== 'search_ad';
    if (scope === 'paid') return r.surface === 'search_ad';
    return true;
  });
}

/** Window nào có data country — Country_L365 đã bị xoá vì giới hạn cell. */
export function windowHasCountryData(data: SheetPayload | null | undefined, window: Window): boolean {
  return countryRows(data, window).length > 0;
}

// ── Chỉ số cân theo doanh thu cho một window ─────────────────────────────────

export interface WeightedContributor {
  country: string;
  weight: number;
  revenue: number;
  valuePerInstall: number | null;
  usersL: number;
  usersP: number;
  /** usersL × weight — phần nước này đóng vào chỉ số. */
  indexL: number;
}

export interface WeightedStats {
  window: Window;
  scope: WeightScope;
  /** Σ users × weight, kỳ này và kỳ trước. Là CHỈ SỐ, không phải số users. */
  indexL: number;
  indexP: number;
  deltaIndexPct: number | null;
  /** Cùng cách tính, trên install. */
  installIndexL: number;
  installIndexP: number;
  deltaInstallPct: number | null;
  /** CR và Pos cân theo doanh thu — hai tỷ số này vẫn đọc được như tỷ số thật. */
  crL: number | null;
  crP: number | null;
  posL: number | null;
  posP: number | null;
  /** Users thô, để đối chiếu với con số cân. */
  rawUsersL: number;
  rawUsersP: number;
  rawInstallL: number;
  rawInstallP: number;
  usersWithWeight: number;
  usersTotal: number;
  /** Phần users (trong phạm vi Country_Lx) nằm ở nước có doanh thu. */
  coverage: number;
  /**
   * Phần users của All_Lx mà tab Country_Lx thật sự có, cùng surface.
   *
   * Khác coverage, và cần cả hai: coverage nói bao nhiêu users trong tab được
   * cân, còn con số này nói bản thân tab đã bỏ sót bao nhiêu. L30 organic có
   * 151 users trong Country_L30 so với 312 trong All_L30 — chỉ hiện coverage
   * 88% sẽ khiến người đọc tưởng chỉ số phủ gần hết.
   *
   * Có thể vượt 1 vì All_L30/All_L90 bị cắt ở 500 dòng, khi đó Country_Lx mới
   * là tab đầy hơn; kẹp về 1 và null khi không có gì để so.
   */
  tabCoverage: number | null;
  reliable: boolean;
  /** Nước có users nhưng chưa có doanh thu — bị loại, và phải được kể tên. */
  excluded: { country: string; usersL: number }[];
  contributors: WeightedContributor[];
  unavailable: boolean;
}

const EMPTY_STATS = (window: Window, scope: WeightScope): WeightedStats => ({
  window,
  scope,
  indexL: 0,
  indexP: 0,
  deltaIndexPct: null,
  installIndexL: 0,
  installIndexP: 0,
  deltaInstallPct: null,
  crL: null,
  crP: null,
  posL: null,
  posP: null,
  rawUsersL: 0,
  rawUsersP: 0,
  rawInstallL: 0,
  rawInstallP: 0,
  usersWithWeight: 0,
  usersTotal: 0,
  coverage: 0,
  tabCoverage: null,
  reliable: false,
  excluded: [],
  contributors: [],
  unavailable: true,
});

const pctDelta = (l: number, p: number): number | null => (p > 0 ? (l - p) / p : null);

/** So users trong Country_Lx với All_Lx cùng surface — xem tab bỏ sót bao nhiêu. */
function allUsersFor(
  data: SheetPayload | null | undefined,
  window: Window,
  scope: WeightScope,
  countryUsers: number,
): number | null {
  const key = ALL_TAB[window];
  if (!data || !key) return null;
  const rows = (data[key] as KeywordRow[] | undefined) ?? [];
  let total = 0;
  for (const r of rows) {
    if (scope === 'organic' && r.surface === 'search_ad') continue;
    if (scope === 'paid' && r.surface !== 'search_ad') continue;
    total += r.usersL ?? 0;
  }
  if (total <= 0) return null;
  return Math.min(1, countryUsers / total);
}

export function revenueWeightedStats(
  data: SheetPayload | null | undefined,
  window: Window,
  scope: WeightScope = 'all',
  weights?: RevenueWeights | null,
): WeightedStats {
  const w = weights ?? buildRevenueWeights(data);
  const rows = countryRows(data, window, scope);
  if (!w || rows.length === 0) return EMPTY_STATS(window, scope);

  const byCountry = new Map<string, {
    country: string;
    weight: number;
    revenue: number;
    valuePerInstall: number | null;
    usersL: number;
    usersP: number;
    getAppL: number;
    getAppP: number;
    posNumL: number;
    posDenL: number;
    posNumP: number;
    posDenP: number;
  }>();

  for (const r of rows) {
    const c = r.country as string;
    const k = countryKey(c);
    let cur = byCountry.get(k);
    if (!cur) {
      const info = w.infoOf(c);
      cur = {
        country: c,
        weight: info?.share ?? 0,
        revenue: info?.revenue ?? 0,
        valuePerInstall: info?.valuePerInstall ?? null,
        usersL: 0,
        usersP: 0,
        getAppL: 0,
        getAppP: 0,
        posNumL: 0,
        posDenL: 0,
        posNumP: 0,
        posDenP: 0,
      };
      byCountry.set(k, cur);
    }
    cur.usersL += r.usersL ?? 0;
    cur.usersP += r.usersP ?? 0;
    cur.getAppL += r.getAppL ?? 0;
    cur.getAppP += r.getAppP ?? 0;
    // Pos là bình quân gia quyền theo users trong nước, rồi mới cân theo tiền.
    if (r.posL != null && r.usersL > 0) {
      cur.posNumL += r.posL * r.usersL;
      cur.posDenL += r.usersL;
    }
    if (r.posP != null && r.usersP > 0) {
      cur.posNumP += r.posP * r.usersP;
      cur.posDenP += r.usersP;
    }
  }

  let indexL = 0;
  let indexP = 0;
  let installIndexL = 0;
  let installIndexP = 0;
  let posNumL = 0;
  let posDenL = 0;
  let posNumP = 0;
  let posDenP = 0;
  let rawUsersL = 0;
  let rawUsersP = 0;
  let rawInstallL = 0;
  let rawInstallP = 0;
  let usersWithWeight = 0;
  const excluded: { country: string; usersL: number }[] = [];
  const contributors: WeightedContributor[] = [];

  byCountry.forEach((c) => {
    rawUsersL += c.usersL;
    rawUsersP += c.usersP;
    rawInstallL += c.getAppL;
    rawInstallP += c.getAppP;
    if (c.weight <= 0) {
      if (c.usersL > 0) excluded.push({ country: c.country, usersL: c.usersL });
      return;
    }
    usersWithWeight += c.usersL;
    indexL += c.usersL * c.weight;
    indexP += c.usersP * c.weight;
    installIndexL += c.getAppL * c.weight;
    installIndexP += c.getAppP * c.weight;
    if (c.posDenL > 0) {
      posNumL += (c.posNumL / c.posDenL) * c.usersL * c.weight;
      posDenL += c.usersL * c.weight;
    }
    if (c.posDenP > 0) {
      posNumP += (c.posNumP / c.posDenP) * c.usersP * c.weight;
      posDenP += c.usersP * c.weight;
    }
    contributors.push({
      country: c.country,
      weight: c.weight,
      revenue: c.revenue,
      valuePerInstall: c.valuePerInstall,
      usersL: c.usersL,
      usersP: c.usersP,
      indexL: c.usersL * c.weight,
    });
  });

  excluded.sort((a, b) => b.usersL - a.usersL);
  contributors.sort((a, b) => b.indexL - a.indexL);
  const coverage = rawUsersL > 0 ? usersWithWeight / rawUsersL : 0;
  const tabCoverage = allUsersFor(data, window, scope, rawUsersL);

  return {
    window,
    scope,
    indexL,
    indexP,
    deltaIndexPct: pctDelta(indexL, indexP),
    installIndexL,
    installIndexP,
    deltaInstallPct: pctDelta(installIndexL, installIndexP),
    crL: indexL > 0 ? installIndexL / indexL : null,
    crP: indexP > 0 ? installIndexP / indexP : null,
    posL: posDenL > 0 ? posNumL / posDenL : null,
    posP: posDenP > 0 ? posNumP / posDenP : null,
    rawUsersL,
    rawUsersP,
    rawInstallL,
    rawInstallP,
    usersWithWeight,
    usersTotal: rawUsersL,
    coverage,
    tabCoverage,
    reliable: coverage >= MIN_COVERAGE,
    excluded,
    contributors,
    unavailable: false,
  };
}

// ── Funnel cân theo doanh thu ────────────────────────────────────────────────

const asChannel = (s: WeightedStats): { L: ChannelMetrics; P: ChannelMetrics } => ({
  L: { users: s.indexL, getapp: s.installIndexL, cr: s.crL ?? 0, pos: s.posL },
  P: { users: s.indexP, getapp: s.installIndexP, cr: s.crP ?? 0, pos: s.posP },
});

export interface WeightedFunnel extends FunnelBreakdown {
  /** Coverage của từng surface, vì organic trong Country_L* mỏng hơn paid rất nhiều. */
  coverage: { organic: number; paid: number };
  /** Phần users của All_Lx mà Country_Lx có — tab bỏ sót bao nhiêu. */
  tabCoverage: { organic: number | null; paid: number | null };
  /** True khi cả hai surface đều có dữ liệu để cân. */
  available: boolean;
}

export function revenueWeightedFunnel(
  data: SheetPayload | null | undefined,
  window: Window,
  weights?: RevenueWeights | null,
): WeightedFunnel | null {
  const w = weights ?? buildRevenueWeights(data);
  if (!w) return null;
  const organic = revenueWeightedStats(data, window, 'organic', w);
  const paid = revenueWeightedStats(data, window, 'paid', w);
  if (organic.unavailable && paid.unavailable) return null;

  const o = asChannel(organic);
  const p = asChannel(paid);
  return {
    window,
    organic: o,
    paid: p,
    total: {
      L: { users: o.L.users + p.L.users, getapp: o.L.getapp + p.L.getapp },
      P: { users: o.P.users + p.P.users, getapp: o.P.getapp + p.P.getapp },
    },
    coverage: { organic: organic.coverage, paid: paid.coverage },
    tabCoverage: { organic: organic.tabCoverage, paid: paid.tabCoverage },
    available: true,
  };
}

// ── Rổ keyword cân theo doanh thu ────────────────────────────────────────────

export interface WeightedBasketItem extends DynamicBasketItem {
  /** Σ users × weight của nước — thứ tự rổ dựa trên con số này. */
  index: number;
  /** Users thô, để thấy rõ nó khác thứ tự cũ ở đâu. */
  rawUsers: number;
  /** Hạng nếu vẫn xếp theo users thô — chênh lệch chính là điều đáng xem. */
  rawRank: number;
  /** Nước đóng góp nhiều nhất vào chỉ số của keyword này. */
  topCountry: string | null;
  topCountryShare: number;
  /** Users của keyword nằm ở nước chưa có doanh thu. */
  unweightedUsers: number;
}

/**
 * Rổ keyword xếp theo doanh thu thay vì theo users.
 *
 * Rổ cũ (`marketIndex.basket`) là top keyword theo Users L90 — cùng một vấn đề
 * như trọng số cũ: một keyword toàn users India xếp trên một keyword ít users
 * nhưng toàn US. Ở đây mỗi keyword được cộng users × weight của nước, nên thứ
 * tự phản ánh tiền.
 */
export function revenueWeightedBasket(
  data: SheetPayload | null | undefined,
  window: Window = 'L90',
  limit = 10,
  weights?: RevenueWeights | null,
): WeightedBasketItem[] {
  const w = weights ?? buildRevenueWeights(data);
  const rows = countryRows(data, window, 'all');
  if (!w || rows.length === 0) return [];

  const byKw = new Map<string, {
    searchTerm: string;
    index: number;
    rawUsers: number;
    unweightedUsers: number;
    byCountry: Map<string, number>;
  }>();

  for (const r of rows) {
    const term = (r.searchTerm ?? '').trim();
    if (!term) continue;
    const users = r.usersL ?? 0;
    if (users <= 0) continue;
    const weight = w.weightOf(r.country);
    let cur = byKw.get(term);
    if (!cur) {
      cur = { searchTerm: term, index: 0, rawUsers: 0, unweightedUsers: 0, byCountry: new Map() };
      byKw.set(term, cur);
    }
    cur.rawUsers += users;
    if (weight <= 0) {
      cur.unweightedUsers += users;
    } else {
      const add = users * weight;
      cur.index += add;
      cur.byCountry.set(r.country as string, (cur.byCountry.get(r.country as string) ?? 0) + add);
    }
  }

  const all = Array.from(byKw.values());
  const rawOrder = new Map(
    Array.from(all).sort((a, b) => b.rawUsers - a.rawUsers).map((k, i): [string, number] => [k.searchTerm, i + 1]),
  );

  return all
    .filter((k) => k.index > 0)
    .sort((a, b) => b.index - a.index)
    .slice(0, limit)
    .map((k, i) => {
      let topCountry: string | null = null;
      let topVal = 0;
      k.byCountry.forEach((v, c) => {
        if (v > topVal) {
          topVal = v;
          topCountry = c;
        }
      });
      return {
        rank: i + 1,
        searchTerm: k.searchTerm,
        // Giữ tên field của rổ cũ để component dùng lại được, nhưng con số là
        // users thô của window đang chọn — không nhất thiết là L90.
        l90Users: k.rawUsers,
        index: k.index,
        rawUsers: k.rawUsers,
        rawRank: rawOrder.get(k.searchTerm) ?? 0,
        topCountry,
        topCountryShare: k.index > 0 ? topVal / k.index : 0,
        unweightedUsers: k.unweightedUsers,
      };
    });
}

// ── WoW cân theo doanh thu ───────────────────────────────────────────────────

export function revenueWeightedWow(
  data: SheetPayload | null | undefined,
  weights?: RevenueWeights | null,
): WowMetric[] {
  const s = revenueWeightedStats(data, 'L7', 'all', weights);
  if (s.unavailable) return [];
  const mk = (metric: string, l: number, p: number): WowMetric => ({
    metric,
    thisPeriod: l,
    lastPeriod: p,
    deltaValue: l - p,
    deltaPct: p > 0 ? (l - p) / p : 0,
    status: '',
  });
  return [
    mk('Chỉ số Install (L7, cân doanh thu)', s.installIndexL, s.installIndexP),
    mk('Chỉ số Users (L7, cân doanh thu)', s.indexL, s.indexP),
  ];
}

// ── Nước lệch giữa traffic và doanh thu ──────────────────────────────────────

export interface MismatchRow {
  country: string;
  usersL: number;
  usersShare: number;
  revenueShare: number;
  revenue: number;
  valuePerInstall: number | null;
  /** usersShare ÷ revenueShare. >1 là traffic nhiều hơn tiền. */
  ratio: number | null;
}

export interface MismatchReport {
  window: Window;
  /** Nhiều traffic, ít tiền — đang tiêu công sức vào nước không sinh doanh thu. */
  trafficHeavy: MismatchRow[];
  /** Ít traffic, nhiều tiền — nước đáng đẩy thêm mà đang mỏng. */
  revenueHeavy: MismatchRow[];
  /** Tổng users của các nước traffic-heavy, để nói được "chiếm x% traffic". */
  trafficHeavyShare: number;
  revenueHeavyShare: number;
}

/**
 * Nước mà share traffic và share doanh thu lệch nhau đủ để đáng nói.
 *
 * Hai chiều lệch có ý nghĩa khác nhau nên không gộp làm một danh sách:
 * traffic-heavy là chỗ đang đổ traffic mà không thu được gì; revenue-heavy là
 * chỗ có tiền mà mình đang mỏng — cái đầu để cắt, cái sau để đẩy.
 *
 * Nước dưới MIN_MISMATCH_USERS bị bỏ qua: tỷ lệ tính trên 2 users lệch bao nhiêu
 * cũng không nói lên điều gì, mà lại đẩy nước thật sự lệch ra khỏi danh sách.
 */
export function weightMismatch(
  data: SheetPayload | null | undefined,
  window: Window = 'L90',
  weights?: RevenueWeights | null,
): MismatchReport | null {
  const w = weights ?? buildRevenueWeights(data);
  const rows = countryRows(data, window, 'all');
  if (!w || rows.length === 0) return null;

  const users = new Map<string, { country: string; usersL: number }>();
  let totalUsers = 0;
  for (const r of rows) {
    const k = countryKey(r.country);
    const cur = users.get(k) ?? { country: r.country as string, usersL: 0 };
    cur.usersL += r.usersL ?? 0;
    users.set(k, cur);
    totalUsers += r.usersL ?? 0;
  }
  if (totalUsers <= 0) return null;

  const trafficHeavy: MismatchRow[] = [];
  const revenueHeavy: MismatchRow[] = [];

  users.forEach((u, k) => {
    if (u.usersL < MIN_MISMATCH_USERS) return;
    const info = w.byKey.get(k);
    const usersShare = u.usersL / totalUsers;
    const revenueShare = info?.share ?? 0;
    const row: MismatchRow = {
      country: u.country,
      usersL: u.usersL,
      usersShare,
      revenueShare,
      revenue: info?.revenue ?? 0,
      valuePerInstall: info?.valuePerInstall ?? null,
      ratio: revenueShare > 0 ? usersShare / revenueShare : null,
    };
    // ratio null = doanh thu 0: lệch tuyệt đối, không phải lệch tỷ lệ.
    if (row.ratio === null || row.ratio >= MISMATCH_RATIO) trafficHeavy.push(row);
    else if (row.ratio <= 1 / MISMATCH_RATIO) revenueHeavy.push(row);
  });

  // Nước có tiền nhưng ít/không có traffic cũng là revenue-heavy — và là loại
  // đáng chú ý nhất, vì nó không xuất hiện trong bất kỳ bảng traffic nào.
  w.byKey.forEach((info, k) => {
    const u = users.get(k);
    if (u && u.usersL >= MIN_MISMATCH_USERS) return;
    if (info.share < 0.01) return;
    const usersL = u?.usersL ?? 0;
    revenueHeavy.push({
      country: info.country,
      usersL,
      usersShare: usersL / totalUsers,
      revenueShare: info.share,
      revenue: info.revenue,
      valuePerInstall: info.valuePerInstall,
      ratio: info.share > 0 ? usersL / totalUsers / info.share : null,
    });
  });

  trafficHeavy.sort((a, b) => b.usersShare - a.usersShare);
  revenueHeavy.sort((a, b) => b.revenueShare - a.revenueShare);
  // Cùng một nước có thể vào revenueHeavy hai lần (một lần từ vòng users, một
  // lần từ vòng doanh thu) khi nó vừa đủ users vừa nặng tiền.
  const seen = new Set<string>();
  const dedupedRevenueHeavy = revenueHeavy.filter((r) => {
    const k = countryKey(r.country);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    window,
    trafficHeavy,
    revenueHeavy: dedupedRevenueHeavy,
    trafficHeavyShare: trafficHeavy.reduce((s, r) => s + r.usersShare, 0),
    revenueHeavyShare: dedupedRevenueHeavy.reduce((s, r) => s + r.revenueShare, 0),
  };
}
