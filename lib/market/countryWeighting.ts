import type { KeywordRow, SheetPayload, Window } from '@/lib/sheets/types';
import { normCountryToken } from '@/lib/sheets/campGeo';

// Trọng số của từng nước — theo tiền, và theo người — cùng một bảng.
//
// Dùng cho nửa dưới trang Market Health. Nửa trên (executive summary, WoW,
// verdict theo window, funnel, top keyword) cố ý KHÔNG cân: đó là câu hỏi
// "toàn thị trường đang lên hay xuống", và cân theo tiền ở đó sẽ biến nó thành
// câu hỏi khác mà vẫn mang tên cũ. Từ Core market xuống mới là chỗ hỏi "nước
// nào đáng nặng", nên trọng số sống ở đây.
//
// Hai trọng số cùng tồn tại vì chúng trả lời hai câu khác nhau:
//
//   share doanh thu — nước đó mang về bao nhiêu phần tiền
//   share users     — nước đó chiếm bao nhiêu phần người dùng
//
// Data hiện tại lệch rất xa: India 6,5% users nhưng 0,07% doanh thu
// ($4/install), Vietnam 5% users và chưa có đồng nào, còn Hong Kong 0,3% users
// lại là 4,1% doanh thu ($261/install). Xếp core market theo users thì India
// và Vietnam vào lõi; xếp theo tiền thì không, mà không cần đặc cách gì.
//
// Cả hai share đều được tính cho MỌI nước, bất kể đang xem theo cách nào — vì
// alert lệch cần cả hai phía, và vì đổi công tắc không nên phải tính lại.

/** Trọng số lấy từ đâu: tiền của nước, hay số người dùng của nước. */
export type WeightBasis = 'revenue' | 'users';

/**
 * Cửa sổ làm mốc cho share users.
 *
 * Cố định ở L90, không đi theo cửa sổ đang xem: trọng số phải là một tính chất
 * của nước, không phải của tuần này. L90 cũng là cửa sổ có nhiều nước nhất
 * (156 nước so với 55 ở L3), nên ít nước bị trọng số 0 chỉ vì tuần rồi không
 * có ai tìm.
 */
export const USER_WEIGHT_WINDOW: Window = 'L90';

/**
 * Nước phải có bao nhiêu users mới được đem ra so users-vs-doanh-thu.
 *
 * Một nước 2 users lệch bao nhiêu cũng không nói lên điều gì, mà lại chiếm chỗ
 * của nước thật sự đang lệch.
 */
const MIN_MISMATCH_USERS = 10;

/** Lệch từ mức này mới đáng gọi tên (share users ÷ share doanh thu). */
const MISMATCH_RATIO = 2.5;

export interface CountryWeight {
  country: string;
  revenue: number;
  /** revenue ÷ tổng doanh thu trong block. */
  revenueShare: number;
  /** Users ở cửa sổ mốc. */
  users: number;
  /** users ÷ tổng users ở cửa sổ mốc. */
  usersShare: number;
  /** Doanh thu ÷ install — một install ở nước này đáng bao nhiêu. */
  valuePerInstall: number | null;
  rank: number | null;
}

export interface CountryWeights {
  byKey: Map<string, CountryWeight>;
  totalRevenue: number;
  /** Tổng users ở cửa sổ mốc. */
  totalUsers: number;
  /** Kỳ của block doanh thu, ví dụ 'tháng 5-8'. */
  period: string;
  /** Số nước có doanh thu > 0. */
  withRevenue: number;
  /** Số nước có users ở cửa sổ mốc. */
  withUsers: number;
  /** Nước nặng nhất theo từng cách cân — để nói rõ ai đang chi phối. */
  topByRevenue: CountryWeight | null;
  topByUsers: CountryWeight | null;
  weightOf(country: string | undefined, basis: WeightBasis): number;
  infoOf(country: string | undefined): CountryWeight | null;
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

const COUNTRY_TAB: Record<string, keyof SheetPayload> = {
  L3: 'countryL3',
  L7: 'countryL7',
  L14: 'countryL14',
  L30: 'countryL30',
  L90: 'countryL90',
};

/**
 * Dòng Country_L* của một window, đã bỏ '(not set)'.
 *
 * Không lọc surface: tab này hầu hết là dòng paid (L90 có 2708 dòng paid so
 * với 292 organic), nên lọc riêng organic sẽ bỏ mất phần lớn dữ liệu về nước.
 */
export function countryRows(
  data: SheetPayload | null | undefined,
  window: Window,
): KeywordRow[] {
  const key = COUNTRY_TAB[window];
  if (!data || !key) return [];
  const rows = (data[key] as KeywordRow[] | undefined) ?? [];
  return rows.filter((r) => r.country && !isNotSet(r.country));
}

export function buildCountryWeights(data: SheetPayload | null | undefined): CountryWeights | null {
  if (!data) return null;

  const revRows = (data.perGeoRevenue ?? []).filter((r) => r.country && r.revenue > 0);
  const totalRevenue = revRows.reduce((s, r) => s + r.revenue, 0);

  const userRows = countryRows(data, USER_WEIGHT_WINDOW);
  const usersByKey = new Map<string, { country: string; users: number }>();
  let totalUsers = 0;
  for (const r of userRows) {
    const k = countryKey(r.country);
    const cur = usersByKey.get(k) ?? { country: r.country as string, users: 0 };
    cur.users += r.usersL ?? 0;
    usersByKey.set(k, cur);
    totalUsers += r.usersL ?? 0;
  }

  if (totalRevenue <= 0 && totalUsers <= 0) return null;

  const byKey = new Map<string, CountryWeight>();
  const mk = (
    country: string,
    revenue: number,
    valuePerInstall: number | null,
    rank: number | null,
    users: number,
  ): CountryWeight => ({
    country,
    revenue,
    revenueShare: totalRevenue > 0 ? revenue / totalRevenue : 0,
    users,
    usersShare: totalUsers > 0 ? users / totalUsers : 0,
    valuePerInstall,
    rank,
  });

  for (const r of revRows) {
    const k = countryKey(r.country);
    const users = usersByKey.get(k)?.users ?? 0;
    const next = mk(
      r.country,
      r.revenue,
      r.valuePerInstall && r.valuePerInstall > 0 ? r.valuePerInstall : null,
      // 88 trong 140 dòng của block không có rank; cell parse ra 0 và `0 ?? x`
      // vẫn là 0, để nguyên thì chúng sắp trước United States.
      r.rank > 0 ? r.rank : null,
      users,
    );
    const cur = byKey.get(k);
    // Cùng một key đến từ hai cách viết tên: giữ dòng nhiều tiền hơn thay vì
    // cộng dồn — cộng dồn sẽ nhân đôi nước bị viết hai kiểu.
    if (!cur || next.revenue > cur.revenue) byKey.set(k, next);
  }
  // Nước có users mà chưa có doanh thu vẫn phải có mặt: cân theo user thì
  // chúng mang trọng số thật, và cân theo tiền thì chúng là thứ cần kể tên.
  usersByKey.forEach((u, k) => {
    if (byKey.has(k)) return;
    byKey.set(k, mk(u.country, 0, null, null, u.users));
  });

  let topByRevenue: CountryWeight | null = null;
  let topByUsers: CountryWeight | null = null;
  let withRevenue = 0;
  let withUsers = 0;
  byKey.forEach((v) => {
    if (v.revenue > 0) withRevenue += 1;
    if (v.users > 0) withUsers += 1;
    if (!topByRevenue || v.revenue > topByRevenue.revenue) topByRevenue = v;
    if (!topByUsers || v.users > topByUsers.users) topByUsers = v;
  });

  return {
    byKey,
    totalRevenue,
    totalUsers,
    period: data.perGeoRevenuePeriod ?? '',
    withRevenue,
    withUsers,
    topByRevenue,
    topByUsers,
    weightOf: (country, basis) => {
      const info = byKey.get(countryKey(country));
      if (!info) return 0;
      return basis === 'revenue' ? info.revenueShare : info.usersShare;
    },
    infoOf: (country) => byKey.get(countryKey(country)) ?? null,
  };
}

// ── Nước lệch giữa traffic và doanh thu ──────────────────────────────────────

export interface MismatchRow {
  country: string;
  users: number;
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
  /** Tổng share users của nhóm traffic-heavy, để nói được "chiếm x% traffic". */
  trafficHeavyShare: number;
  revenueHeavyShare: number;
}

/**
 * Nước mà share traffic và share doanh thu lệch nhau đủ để đáng nói.
 *
 * Hai chiều lệch có ý nghĩa khác nhau nên không gộp làm một danh sách:
 * traffic-heavy là chỗ đang đổ traffic mà không thu được gì; revenue-heavy là
 * chỗ có tiền mà mình đang mỏng — cái đầu để cắt, cái sau để đẩy.
 */
export function weightMismatch(
  weights: CountryWeights | null | undefined,
  window: Window = USER_WEIGHT_WINDOW,
): MismatchReport | null {
  if (!weights || weights.totalUsers <= 0 || weights.totalRevenue <= 0) return null;

  const trafficHeavy: MismatchRow[] = [];
  const revenueHeavy: MismatchRow[] = [];

  weights.byKey.forEach((c) => {
    const row: MismatchRow = {
      country: c.country,
      users: c.users,
      usersShare: c.usersShare,
      revenueShare: c.revenueShare,
      revenue: c.revenue,
      valuePerInstall: c.valuePerInstall,
      ratio: c.revenueShare > 0 ? c.usersShare / c.revenueShare : null,
    };

    if (c.users >= MIN_MISMATCH_USERS) {
      // ratio null = doanh thu 0: lệch tuyệt đối, không phải lệch tỷ lệ.
      if (row.ratio === null || row.ratio >= MISMATCH_RATIO) {
        trafficHeavy.push(row);
        return;
      }
      if (row.ratio <= 1 / MISMATCH_RATIO) {
        revenueHeavy.push(row);
        return;
      }
      return;
    }

    // Nước có tiền nhưng gần như không có traffic cũng là revenue-heavy — và
    // là loại đáng chú ý nhất, vì nó không xuất hiện trong bất kỳ bảng traffic
    // nào nên rất dễ bị bỏ qua hoàn toàn.
    if (c.revenueShare >= 0.01) revenueHeavy.push(row);
  });

  trafficHeavy.sort((a, b) => b.usersShare - a.usersShare);
  revenueHeavy.sort((a, b) => b.revenueShare - a.revenueShare);

  return {
    window,
    trafficHeavy,
    revenueHeavy,
    trafficHeavyShare: trafficHeavy.reduce((s, r) => s + r.usersShare, 0),
    revenueHeavyShare: revenueHeavy.reduce((s, r) => s + r.revenueShare, 0),
  };
}
