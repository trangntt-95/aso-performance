// Báo cáo biến động vị trí keyword chính, gửi email mỗi sáng.
//
// Nguồn: `historyDaily` trong payload (tab GA4_daily_auto, pipeline đổ 08:05).
// Mỗi dòng là một (ngày, keyword, surface) với posDaily + usersDaily. Vị trí
// trung bình của một cửa sổ = trung bình có trọng số theo users (ngày nhiều
// người tìm nặng hơn), so với cửa sổ cùng độ dài liền trước. Δ dương = tụt
// (số thứ hạng tăng), Δ âm = lên.
//
// "Keyword chính" = mọi keyword category Brand + top N keyword theo users L30
// (bỏ Noise/Test). Trang có thể đổi N hoặc thêm danh sách tay sau.

import type { HistoryDailyRow, SheetPayload } from '@/lib/sheets/types';
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
  w: Record<Win, WinStat>;
}

export interface PositionDigest {
  /** Ngày data mới nhất (YYYY-MM-DD). */
  dataDate: string;
  /** Số ngày có data đủ để tính cửa sổ 14 ngày và kỳ trước (cần 28). */
  daysAvailable: number;
  rows: DigestRow[];
  summary: {
    tracked: number;
    worsened7: number;
    improved7: number;
    worst: DigestRow | null;
    best: DigestRow | null;
    threshold: number;
  };
}

const iso = (v: string | number): string | null => {
  const d = parseSheetDate(v);
  return d ? d.toISOString().slice(0, 10) : null;
};

function windowAvg(rows: HistoryDailyRow[], dates: Set<string>): { pos: number | null; users: number } {
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
  const pos = w > 0 ? wsum / w : n > 0 ? plain / n : null;
  return { pos, users };
}

export function buildPositionDigest(
  data: SheetPayload,
  opts: { topN?: number; threshold?: number; minUsers7?: number } = {},
): PositionDigest | null {
  const topN = opts.topN ?? 30;
  const threshold = opts.threshold ?? 1;
  const daily = data.historyDaily ?? [];
  if (daily.length === 0) return null;

  // Ngày có data, mới nhất cuối.
  const dateSet = new Set<string>();
  for (const r of daily) {
    const d = iso(r.snapshotDate);
    if (d) dateSet.add(d);
  }
  const dates = Array.from(dateSet).sort();
  if (dates.length < 2) return null;
  const dataDate = dates[dates.length - 1];

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

  // Gom dòng theo keyword|surface.
  const groups = new Map<string, HistoryDailyRow[]>();
  for (const r of daily) {
    const k = r.searchTerm.trim().toLowerCase();
    if (!tracked.has(k)) continue;
    const key = `${k}|${r.surface}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const winDates = (n: number, offset: number): Set<string> => new Set(dates.slice(Math.max(0, dates.length - offset - n), dates.length - offset));

  const rows: DigestRow[] = [];
  for (const [key, g] of Array.from(groups.entries())) {
    const [k, surface] = key.split('|');
    const w = {} as Record<Win, WinStat>;
    let any = false;
    for (const n of WINDOWS) {
      const cur = windowAvg(g, winDates(n, 0));
      const prev = windowAvg(g, winDates(n, n));
      const delta = cur.pos !== null && prev.pos !== null ? cur.pos - prev.pos : null;
      if (cur.pos !== null) any = true;
      w[n] = { pos: cur.pos, posPrev: prev.pos, delta, users: cur.users, usersPrev: prev.users };
    }
    if (!any) continue;
    // Dòng 1–2 users mỗi tuần thì vị trí nhảy ngẫu nhiên, không đáng báo;
    // Brand thì giữ hết vì đó là thứ Trang muốn canh.
    const isBrand = brand.has(k);
    if (!isBrand && w[7].users + w[7].usersPrev < (opts.minUsers7 ?? 5)) continue;
    rows.push({
      keyword: k,
      category: catOf.get(k) ?? '',
      surface: surface === 'search_ad' ? 'paid' : 'organic',
      isBrand,
      w,
    });
  }

  // Tụt mạnh nhất (L7) lên đầu; chưa so được xuống cuối; cùng Δ thì nhiều users trước.
  rows.sort((a, b) => {
    const da = a.w[7].delta;
    const db = b.w[7].delta;
    if (da === null && db === null) return b.w[7].users - a.w[7].users;
    if (da === null) return 1;
    if (db === null) return -1;
    if (db !== da) return db - da;
    return b.w[7].users - a.w[7].users;
  });

  const worsened7 = rows.filter((r) => r.w[7].delta !== null && r.w[7].delta >= threshold).length;
  const improved7 = rows.filter((r) => r.w[7].delta !== null && r.w[7].delta <= -threshold).length;
  const withDelta = rows.filter((r) => r.w[7].delta !== null);
  const worst = withDelta[0] && withDelta[0].w[7].delta! >= threshold ? withDelta[0] : null;
  const bestCand = withDelta[withDelta.length - 1];
  const best = bestCand && bestCand.w[7].delta! <= -threshold ? bestCand : null;

  return {
    dataDate,
    daysAvailable: dates.length,
    rows,
    summary: { tracked: rows.length, worsened7, improved7, worst, best, threshold },
  };
}
