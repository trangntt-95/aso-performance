import type { BidCapRow, KeywordRow, SheetPayload } from '@/lib/sheets/types';
import { normKw } from '@/lib/sheets/kwNorm';

// Vị trí của keyword theo nước qua các cửa sổ L3 / L7 / L14 / L30 / L90.
//
// Nguồn là các tab Country_L* (GA4): mỗi dòng keyword × nước × kênh có posL
// (vị trí trung bình trong cửa sổ) và posP (cửa sổ liền trước). Đặt năm cửa sổ
// cạnh nhau là cách duy nhất trong workbook để thấy vị trí đang trôi theo
// hướng nào mà không phải mở từng keyword.
//
// Trang muốn mặc định chỉ thấy BRAND và các keyword PROFIT chính ở thị trường
// Tier 2–3 — chỗ đang đẩy bid để lên top — còn lại ẩn tới khi lọc. Tier của
// nước lấy từ 'Max bid cap' (cột Tier), là bảng tier thật đang dùng để đặt bid;
// Market_Index cũng có tier nhưng layout đó vừa đổi và đang đọc lệch.

export const POSITION_WINDOWS = ['L3', 'L7', 'L14', 'L30', 'L90'] as const;
export type PositionWindow = (typeof POSITION_WINDOWS)[number];

const WINDOW_TAB: Record<PositionWindow, keyof SheetPayload> = {
  L3: 'countryL3',
  L7: 'countryL7',
  L14: 'countryL14',
  L30: 'countryL30',
  L90: 'countryL90',
};

export interface PositionCell {
  /** Vị trí trung bình trong cửa sổ. null = có traffic nhưng GA4 không có rank. */
  pos: number | null;
  /** Vị trí cửa sổ liền trước (posP của tab). */
  posPrev: number | null;
  users: number;
  installs: number;
}

export type SurfaceKey = 'organic' | 'paid';

export interface PositionRow {
  keyword: string;
  category: string;
  country: string;
  /** Tier của nước theo 'Max bid cap'; '' khi nước không có trong đó. */
  tier: string;
  /** cửa sổ → kênh → ô. Thiếu = keyword không có dòng ở cửa sổ/kênh đó. */
  cells: Partial<Record<PositionWindow, Partial<Record<SurfaceKey, PositionCell>>>>;
  /** Tổng users mọi cửa sổ, mọi kênh — để xếp và để lọc "top". */
  users: number;
  lang: string;
  english: string;
}

/** nước → tier, từ 'Max bid cap'. */
export function countryTierIndex(bidCap: BidCapRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of bidCap) {
    if (!r.country || !r.tier) continue;
    const k = r.country.trim().toLowerCase();
    if (!out.has(k)) out.set(k, r.tier.trim());
  }
  return out;
}

/** Tier 2 / Tier 3 theo cách sheet ghi ('Tier 2', 'Tier 3'). */
export const isTier23 = (tier: string): boolean => /^tier\s*[23]\b/i.test(tier.trim());
/** Mọi tier 1: 'Tier 1 Premium', 'Tier 1 Strong', 'Tier 1.5'. */
export const isTier1 = (tier: string): boolean => /^tier\s*1\b/i.test(tier.trim());

/** Hai keyword Trang luôn muốn thấy ở Tier 1, bất kể users. */
export const TIER1_CORE_KEYWORDS = ['trueprofit', 'profit'];

/** Tổng install của một dòng ở một cửa sổ, theo kênh đã chọn. null = không có dòng. */
export function cellInstalls(row: PositionRow, w: PositionWindow, surface: SurfaceKey | 'both'): number | null {
  const c = row.cells[w];
  if (!c) return null;
  if (surface !== 'both') return c[surface]?.installs ?? null;
  const parts = [c.organic, c.paid].filter((x): x is PositionCell => !!x);
  return parts.length ? parts.reduce((s, x) => s + x.installs, 0) : null;
}

export function buildPositionRows(data: SheetPayload | null | undefined): PositionRow[] {
  if (!data) return [];
  const tierOf = countryTierIndex(data.bidCap ?? []);
  const rows = new Map<string, PositionRow>();
  for (const w of POSITION_WINDOWS) {
    const tab = (data[WINDOW_TAB[w]] as KeywordRow[] | undefined) ?? [];
    for (const r of tab) {
      if (!r.country || !r.searchTerm) continue;
      const key = `${normKw(r.searchTerm)}|${r.country.trim().toLowerCase()}`;
      let row = rows.get(key);
      if (!row) {
        row = {
          keyword: r.searchTerm.trim(),
          category: r.category,
          country: r.country.trim(),
          tier: tierOf.get(r.country.trim().toLowerCase()) ?? '',
          cells: {},
          users: 0,
          lang: r.lang ?? '',
          english: r.english ?? '',
        };
        rows.set(key, row);
      }
      if (!row.lang && r.lang) row.lang = r.lang;
      if (!row.english && r.english) row.english = r.english;
      const surface: SurfaceKey = r.surface === 'search_ad' ? 'paid' : 'organic';
      const cell: PositionCell = {
        pos: r.posL !== null && r.posL !== undefined && r.posL > 0 ? r.posL : null,
        posPrev: r.posP !== null && r.posP !== undefined && r.posP > 0 ? r.posP : null,
        users: r.usersL,
        installs: r.getAppL,
      };
      const byWin = (row.cells[w] ??= {});
      const prev = byWin[surface];
      // Một tab có thể có hai dòng cùng keyword × nước × kênh (hai biến thể
      // viết); gộp theo users, vị trí lấy gia quyền theo users.
      if (prev) {
        const u = prev.users + cell.users;
        byWin[surface] = {
          pos:
            prev.pos !== null && cell.pos !== null && u > 0
              ? (prev.pos * prev.users + cell.pos * cell.users) / u
              : prev.pos ?? cell.pos,
          posPrev: prev.posPrev ?? cell.posPrev,
          users: u,
          installs: prev.installs + cell.installs,
        };
      } else {
        byWin[surface] = cell;
      }
      row.users += cell.users;
    }
  }
  const out = Array.from(rows.values()).filter((r) =>
    POSITION_WINDOWS.some((w) => {
      const c = r.cells[w];
      return c && ((c.organic?.pos ?? null) !== null || (c.paid?.pos ?? null) !== null);
    }),
  );
  return out;
}

/**
 * Keyword Profit "chính": top N theo users mọi nước, mọi cửa sổ, mọi kênh.
 *
 * Không có cột nào trong sheet đánh dấu keyword chính, nên định nghĩa bằng
 * traffic: keyword Profit nhiều người tìm nhất chính là keyword đang tranh
 * vị trí. N mặc định 5, đổi được trên màn.
 */
export function topProfitKeywords(rows: PositionRow[], n = 5): string[] {
  const byKw = new Map<string, number>();
  for (const r of rows) {
    if (r.category !== 'Profit') continue;
    const k = normKw(r.keyword);
    byKw.set(k, (byKw.get(k) ?? 0) + r.users);
  }
  return Array.from(byKw.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/** Vị trí đại diện của một dòng ở một cửa sổ, theo kênh đã chọn ('both' =
 *  gia quyền theo users của hai kênh). */
export function cellPos(
  row: PositionRow,
  w: PositionWindow,
  surface: SurfaceKey | 'both',
): { pos: number | null; posPrev: number | null; users: number } | null {
  const c = row.cells[w];
  if (!c) return null;
  if (surface !== 'both') {
    const x = c[surface];
    return x ? { pos: x.pos, posPrev: x.posPrev, users: x.users } : null;
  }
  const parts = [c.organic, c.paid].filter((x): x is PositionCell => !!x);
  if (parts.length === 0) return null;
  const withPos = parts.filter((x) => x.pos !== null);
  const u = withPos.reduce((s, x) => s + x.users, 0);
  const pos =
    withPos.length === 0
      ? null
      : u > 0
        ? withPos.reduce((s, x) => s + (x.pos as number) * x.users, 0) / u
        : withPos.reduce((s, x) => s + (x.pos as number), 0) / withPos.length;
  const withPrev = parts.filter((x) => x.posPrev !== null);
  const up = withPrev.reduce((s, x) => s + x.users, 0);
  const posPrev =
    withPrev.length === 0
      ? null
      : up > 0
        ? withPrev.reduce((s, x) => s + (x.posPrev as number) * x.users, 0) / up
        : withPrev.reduce((s, x) => s + (x.posPrev as number), 0) / withPrev.length;
  return { pos, posPrev, users: parts.reduce((s, x) => s + x.users, 0) };
}
