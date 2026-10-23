// Báo cáo biến động vị trí keyword chính, gửi email mỗi sáng.
//
// Nguồn: `historyDaily` (tab GA4_daily_auto, mọi nước gộp) và
// `historyDailyCountry` (GA4_daily_country_auto, từng nước). Mỗi dòng là một
// (ngày, keyword, surface[, country]) với posDaily + usersDaily. Vị trí trung
// bình của một cửa sổ = trung bình có trọng số theo users, so với cửa sổ cùng
// độ dài liền trước. Δ dương = tụt (số thứ hạng tăng), Δ âm = lên.
//
// Mỗi nước một vị trí khác nhau (Trang 23/10/2026), nên mỗi keyword×kênh có
// một dòng "mọi nước" rồi các dòng nước bên dưới; Việt Nam và Ấn Độ bỏ vì đó
// là team tự tìm, vị trí không nói lên gì.
//
// "Keyword chính" = mọi keyword category Brand + top N keyword theo users L30
// (bỏ Noise/Test).

import type { HistoryDailyCountryRow, HistoryDailyRow, SheetPayload } from '@/lib/sheets/types';
import { parseSheetDate } from '@/lib/utils/format';

export const WINDOWS = [3, 7, 14, 30] as const;
export type Win = (typeof WINDOWS)[number];

export interface WinStat {
  pos: number | null;
  posPrev: number | null;
  /** pos - posPrev: dương = tụt hạng. */
  delta: number | null;
  users: number;
  usersPrev: number;
}

export interface DigestRow {
  keyword: string;
  category: string;
  surface: 'organic' | 'paid';
  isBrand: boolean;
  /** null = mọi nước gộp. */
  country: string | null;
  w: Record<Win, WinStat>;
}

export interface DigestGroup {
  keyword: string;
  category: string;
  surface: 'organic' | 'paid';
  isBrand: boolean;
  all: DigestRow;
  countries: DigestRow[];
  /** Số nước có data nhưng bị cắt khỏi danh sách (ít users). */
  moreCountries: number;
}

export type ActionKind = 'paid_drop' | 'organic_drop' | 'brand_not_top' | 'win';

export interface ActionItem {
  kind: ActionKind;
  /** 'high' = cần làm hôm nay; 'mid' = theo dõi, nhỏ hoặc ít users. */
  severity: 'high' | 'mid';
  row: DigestRow;
  /** Xu hướng 3 ngày gần nhất so với Δ7: 'worse' tiếp tục tụt, 'recovering' đã hồi, 'flat'. */
  trend3: 'worse' | 'recovering' | 'flat';
  /** Cửa sổ có biến động lớn nhất (3/7/14/30) và Δ của nó. */
  win: Win;
  delta: number;
  /** Camp paid đang chạy cho keyword này (Master KW Lookup, bỏ camp pause), tối đa 2. */
  camps: string[];
  /** Một câu gợi ý. */
  advice: string;
}

export interface PositionDigest {
  dataDate: string;
  daysAvailable: number;
  groups: DigestGroup[];
  actions: ActionItem[];
  wins: ActionItem[];
  /** Dòng không có gì đáng nói, để liệt kê gọn. */
  stable: DigestRow[];
  summary: {
    keywords: number;
    countryRows: number;
    /** Dòng nước tụt / lên từ ngưỡng ở BẤT KỲ cửa sổ nào. */
    worsened: number;
    improved: number;
    worst: DigestRow | null;
    best: DigestRow | null;
    threshold: number;
    excludedCountries: string[];
  };
}

type DailyLike = { snapshotDate: string | number; usersDaily: number | null; posDaily: number | null };

const iso = (v: string | number): string | null => {
  const d = parseSheetDate(v);
  return d ? d.toISOString().slice(0, 10) : null;
};

function windowAvg(rows: DailyLike[], dates: Set<string>): { pos: number | null; users: number } {
  let wsum = 0;
  let w = 0;
  let plain = 0;
  let n = 0;
  let users = 0;
  for (const r of rows) {
    const d = iso(r.snapshotDate);
    if (!d || !dates.has(d)) continue;
    users += r.usersDaily ?? 0;
    if (r.posDaily === null || r.posDaily === undefined || !Number.isFinite(r.posDaily) || r.posDaily <= 0) continue;
    const u = r.usersDaily ?? 0;
    if (u > 0) {
      wsum += r.posDaily * u;
      w += u;
    }
    plain += r.posDaily;
    n++;
  }
  return { pos: w > 0 ? wsum / w : n > 0 ? plain / n : null, users };
}

function stats(rows: DailyLike[], dates: string[]): { w: Record<Win, WinStat>; any: boolean } {
  const winDates = (n: number, offset: number) => new Set(dates.slice(Math.max(0, dates.length - offset - n), dates.length - offset));
  const w = {} as Record<Win, WinStat>;
  let any = false;
  for (const n of WINDOWS) {
    const cur = windowAvg(rows, winDates(n, 0));
    const prev = windowAvg(rows, winDates(n, n));
    if (cur.pos !== null) any = true;
    w[n] = { pos: cur.pos, posPrev: prev.pos, delta: cur.pos !== null && prev.pos !== null ? cur.pos - prev.pos : null, users: cur.users, usersPrev: prev.users };
  }
  return { w, any };
}

/** Cửa sổ có |Δ| lớn nhất của một dòng; null khi chưa so được cửa sổ nào. */
export function biggestMove(r: DigestRow): { win: Win; delta: number } | null {
  let best: { win: Win; delta: number } | null = null;
  for (const n of WINDOWS) {
    const d = r.w[n].delta;
    if (d === null) continue;
    if (!best || Math.abs(d) > Math.abs(best.delta)) best = { win: n, delta: d };
  }
  return best;
}
const byWorst = (a: DigestRow, b: DigestRow) => {
  const da = biggestMove(a)?.delta ?? null;
  const db = biggestMove(b)?.delta ?? null;
  if (da === null && db === null) return b.w[7].users - a.w[7].users;
  if (da === null) return 1;
  if (db === null) return -1;
  if (db !== da) return db - da;
  return b.w[7].users - a.w[7].users;
};

export function buildPositionDigest(
  data: SheetPayload,
  opts: { topN?: number; threshold?: number; minUsers7?: number; maxCountries?: number } = {},
): PositionDigest | null {
  const topN = opts.topN ?? 30;
  const threshold = opts.threshold ?? 1;
  const minUsers = opts.minUsers7 ?? 5;
  const maxCountries = opts.maxCountries ?? 8;
  const daily = data.historyDaily ?? [];
  const dailyCountry = data.historyDailyCountry ?? [];
  if (daily.length === 0) return null;

  const dateSet = new Set<string>();
  for (const r of daily) {
    const d = iso(r.snapshotDate);
    if (d) dateSet.add(d);
  }
  const dates = Array.from(dateSet).sort();
  if (dates.length < 2) return null;
  const dataDate = dates[dates.length - 1];

  // Nước bỏ: team tự tìm (VN, IN) + hard-exclude trong Excluded Countries.
  const excluded = new Set<string>(['Vietnam', 'India']);
  for (const r of data.excludedCountries ?? []) if (r.hardExclude) excluded.add(r.country.trim());

  // Keyword chính.
  const catOf = new Map<string, string>();
  const usersL30 = new Map<string, number>();
  for (const r of data.allL30 ?? []) {
    const k = r.searchTerm.trim().toLowerCase();
    if (!k) continue;
    if (!catOf.has(k) || catOf.get(k) === 'Noise') catOf.set(k, String(r.category));
    usersL30.set(k, (usersL30.get(k) ?? 0) + (r.usersL ?? 0));
  }
  const skip = new Set(['Noise', 'Test', 'Unknown', '']);
  const brand = new Set<string>();
  catOf.forEach((c, k) => {
    if (c === 'Brand' || c === 'Brandname') brand.add(k);
  });
  const top = Array.from(usersL30.entries())
    .filter(([k]) => !skip.has(catOf.get(k) ?? ''))
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([k]) => k);
  const tracked = new Set<string>(Array.from(brand).concat(top));

  const surf = (s: string): 'organic' | 'paid' => (s === 'search_ad' ? 'paid' : 'organic');

  // Gộp mọi nước.
  const allGroups = new Map<string, HistoryDailyRow[]>();
  for (const r of daily) {
    const k = r.searchTerm.trim().toLowerCase();
    if (!tracked.has(k)) continue;
    const key = `${k}|${r.surface}`;
    const g = allGroups.get(key);
    if (g) g.push(r);
    else allGroups.set(key, [r]);
  }
  // Từng nước.
  const countryGroups = new Map<string, Map<string, HistoryDailyCountryRow[]>>();
  for (const r of dailyCountry) {
    const k = r.searchTerm.trim().toLowerCase();
    if (!tracked.has(k)) continue;
    const c = r.country.trim();
    if (excluded.has(c)) continue;
    const key = `${k}|${r.surface}`;
    let m = countryGroups.get(key);
    if (!m) {
      m = new Map();
      countryGroups.set(key, m);
    }
    const g = m.get(c);
    if (g) g.push(r);
    else m.set(c, [r]);
  }

  const groups: DigestGroup[] = [];
  for (const [key, rows] of Array.from(allGroups.entries())) {
    const [k, surface] = key.split('|');
    const isBrand = brand.has(k);
    const { w, any } = stats(rows, dates);
    if (!any) continue;
    // Dòng 1–2 users mỗi tuần thì vị trí nhảy ngẫu nhiên; Brand giữ hết.
    if (!isBrand && w[7].users + w[7].usersPrev < minUsers) continue;
    const base = { keyword: k, category: catOf.get(k) ?? '', surface: surf(surface), isBrand };
    const all: DigestRow = { ...base, country: null, w };

    const countries: DigestRow[] = [];
    let hidden = 0;
    const cm = countryGroups.get(key);
    if (cm) {
      for (const [c, crows] of Array.from(cm.entries())) {
        const s = stats(crows, dates);
        if (!s.any) continue;
        if (s.w[7].users + s.w[7].usersPrev < (isBrand ? 3 : minUsers)) {
          hidden++;
          continue;
        }
        countries.push({ ...base, country: c, w: s.w });
      }
    }
    countries.sort((a, b) => b.w[7].users - a.w[7].users);
    const shown = countries.slice(0, maxCountries);
    hidden += countries.length - shown.length;
    groups.push({ ...base, all, countries: shown, moreCountries: hidden });
  }

  // Nhóm biến động mạnh nhất lên đầu: lấy Δ xấu nhất (ở bất kỳ cửa sổ nào) trong nhóm.
  const worstDelta = (g: DigestGroup) => Math.max(...[g.all, ...g.countries].map((r) => biggestMove(r)?.delta ?? -Infinity));
  groups.sort((a, b) => {
    const da = worstDelta(a);
    const db = worstDelta(b);
    if (db !== da) return db - da;
    return b.all.w[7].users - a.all.w[7].users;
  });

  // Camp paid đang chạy cho từng keyword (Master KW Lookup trừ camp pause).
  const paused = new Set((data.pausedKw ?? []).map((r) => r.camp.trim().toLowerCase()));
  const campsOf = new Map<string, string[]>();
  for (const m of data.masterKwLookup ?? []) {
    const k = m.keyword.trim().toLowerCase();
    const camp = m.camp.trim();
    if (!k || !camp || paused.has(camp.toLowerCase())) continue;
    const list = campsOf.get(k) ?? [];
    if (!list.includes(camp) && list.length < 2) list.push(camp);
    campsOf.set(k, list);
  }

  const classify = (r: DigestRow): ActionItem | null => {
    const mv = biggestMove(r);
    const d3 = r.w[3].delta;
    const trend3: ActionItem['trend3'] = d3 === null ? 'flat' : d3 >= 0.5 ? 'worse' : d3 <= -0.5 ? 'recovering' : 'flat';
    const users = r.w[7].users;
    const place = r.country ?? 'mọi nước';
    const camps = campsOf.get(r.keyword) ?? [];
    const campTxt = camps.length ? ` (${camps.join(' | ')})` : ' (chưa thấy camp active trong Master)';
    const win: Win = mv?.win ?? 7;
    const d7 = mv?.delta ?? null; // Δ của cửa sổ biến động mạnh nhất
    const winTxt = `trong ${win} ngày`;
    if (d7 !== null && d7 >= threshold) {
      const big = d7 >= 2 || users >= 10 || r.isBrand;
      if (r.surface === 'paid') {
        return {
          kind: 'paid_drop',
          severity: big ? 'high' : 'mid',
          row: r,
          trend3,
          win,
          delta: d7,
          camps,
          advice: `Paid tụt ${d7.toFixed(1)} bậc ${winTxt} ở ${place}${trend3 === 'worse' ? ', 3 ngày gần nhất còn tụt tiếp' : trend3 === 'recovering' ? ', 3 ngày gần nhất đã hồi' : ''}. Kiểm tra bid/budget camp${campTxt}; nếu Max bid cap còn dư thì nâng bid 10–15%.`,
        };
      }
      return {
        kind: 'organic_drop',
        severity: big ? 'high' : 'mid',
        row: r,
        trend3,
        win,
        delta: d7,
        camps,
        advice: `Organic tụt ${d7.toFixed(1)} bậc ${winTxt} ở ${place}${trend3 === 'worse' ? ', còn tụt tiếp' : trend3 === 'recovering' ? ', đã hồi 3 ngày gần nhất' : ''}. Xem đối thủ mới / metadata; ${camps.length ? `đang có paid${campTxt} nên giữ bid để không mất install` : 'chưa có paid cho keyword này, cân nhắc bật paid để giữ chỗ'}.`,
      };
    }
    if (r.isBrand && r.surface === 'organic' && r.w[7].pos !== null && r.w[7].pos > 1.5 && users >= 3) {
      return {
        kind: 'brand_not_top',
        severity: 'high',
        row: r,
        trend3,
        win: 7,
        delta: r.w[7].delta ?? 0,
        camps,
        advice: `Brand không đứng top 1 ở ${place} (vị trí ${r.w[7].pos.toFixed(1)}). Có đối thủ mua brand hoặc app khác trùng tên; bật/kiểm tra camp brand${campTxt}.`,
      };
    }
    if (d7 !== null && d7 <= -threshold) {
      return {
        kind: 'win',
        severity: users >= 10 || r.isBrand ? 'high' : 'mid',
        row: r,
        trend3,
        win,
        delta: d7,
        camps,
        advice: `Lên ${Math.abs(d7).toFixed(1)} bậc ${winTxt} ở ${place}. ${r.surface === 'paid' ? 'Bid hiện tại đang hiệu quả, giữ nguyên.' : 'Organic đang mạnh, nếu có paid thì có thể hạ bid thử.'}`,
      };
    }
    return null;
  };

  const countryRows = groups.flatMap((g) => g.countries);
  const everyRow = groups.flatMap((g) => [g.all, ...g.countries]);
  const classified = everyRow.map((r) => ({ r, a: classify(r) }));
  const sevRank = (a: ActionItem) => (a.severity === 'high' ? 0 : 1);
  const actions = classified
    .map((x) => x.a)
    .filter((a): a is ActionItem => !!a && a.kind !== 'win')
    .sort((a, b) => sevRank(a) - sevRank(b) || b.delta - a.delta || b.row.w[7].users - a.row.w[7].users);
  const wins = classified
    .map((x) => x.a)
    .filter((a): a is ActionItem => !!a && a.kind === 'win')
    .sort((a, b) => a.delta - b.delta);
  const stable = classified.filter((x) => !x.a && x.r.country === null).map((x) => x.r);

  const scored = countryRows.concat(groups.map((g) => g.all)).filter((r) => biggestMove(r) !== null).sort(byWorst);
  const worsened = countryRows.filter((r) => (biggestMove(r)?.delta ?? 0) >= threshold).length;
  const improved = countryRows.filter((r) => (biggestMove(r)?.delta ?? 0) <= -threshold).length;
  const worst = scored[0] && biggestMove(scored[0])!.delta >= threshold ? scored[0] : null;
  const last = scored[scored.length - 1];
  const best = last && biggestMove(last)!.delta <= -threshold ? last : null;

  return {
    dataDate,
    daysAvailable: dates.length,
    groups,
    actions,
    wins,
    stable,
    summary: {
      keywords: groups.length,
      countryRows: countryRows.length,
      worsened,
      improved,
      worst,
      best,
      threshold,
      excludedCountries: Array.from(excluded).sort(),
    },
  };
}
