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

export const WINDOWS = [3, 7, 14] as const;
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

export interface PositionDigest {
  dataDate: string;
  daysAvailable: number;
  groups: DigestGroup[];
  summary: {
    keywords: number;
    countryRows: number;
    worsened7: number;
    improved7: number;
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

const byWorst7 = (a: DigestRow, b: DigestRow) => {
  const da = a.w[7].delta;
  const db = b.w[7].delta;
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

  // Nhóm tụt mạnh nhất lên đầu: lấy Δ7 xấu nhất trong nhóm (mọi nước hoặc một nước).
  const worstDelta = (g: DigestGroup) => Math.max(...[g.all, ...g.countries].map((r) => r.w[7].delta ?? -Infinity));
  groups.sort((a, b) => {
    const da = worstDelta(a);
    const db = worstDelta(b);
    if (db !== da) return db - da;
    return b.all.w[7].users - a.all.w[7].users;
  });

  const countryRows = groups.flatMap((g) => g.countries);
  const scored = countryRows.concat(groups.map((g) => g.all)).filter((r) => r.w[7].delta !== null).sort(byWorst7);
  const worsened7 = countryRows.filter((r) => r.w[7].delta !== null && r.w[7].delta >= threshold).length;
  const improved7 = countryRows.filter((r) => r.w[7].delta !== null && r.w[7].delta <= -threshold).length;
  const worst = scored[0] && scored[0].w[7].delta! >= threshold ? scored[0] : null;
  const last = scored[scored.length - 1];
  const best = last && last.w[7].delta! <= -threshold ? last : null;

  return {
    dataDate,
    daysAvailable: dates.length,
    groups,
    summary: {
      keywords: groups.length,
      countryRows: countryRows.length,
      worsened7,
      improved7,
      worst,
      best,
      threshold,
      excludedCountries: Array.from(excluded).sort(),
    },
  };
}
