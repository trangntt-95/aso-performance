import type { HistoryDailyRow, HistoryRow, Surface } from './types';

// Chuỗi L7 (tab History của Apps Script: users L7D + pos L7D mỗi ngày cho từng
// term × surface) dựng lại từ GA4 gốc theo ngày (GA4_daily_auto). Trang 19/10/2026:
// "thay hết để không phụ thuộc Apps Script". Tính rolling 7 ngày từ usersDaily /
// posDaily cho MỌI ngày trong khoảng, kể cả ngày term không có user (tab GA4 chỉ
// có dòng cho ngày có user, nên không lấy thẳng cột usersL7D được — chuỗi sẽ
// thủng ở những ngày đó). Pos L7D = trung bình pos theo users, như build-ga4-daily.

const DAY = 86400000;

function isoOf(v: string | number): string | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 20000 || v > 90000) return null;
    return new Date(Date.UTC(1899, 11, 30) + v * DAY).toISOString().slice(0, 10);
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v).trim());
  return m ? m[1] : null;
}

interface Day { users: number; posW: number; posN: number }

/**
 * Rolling-7-ngày từ dòng per-day. Chỉ dùng dòng có usersDaily (dòng L7D-only của
 * Apps Script cũ bị bỏ qua). Trả về dòng cho ngày có users L7D > 0.
 */
export function historyFromDaily(daily: HistoryDailyRow[]): HistoryRow[] {
  const series = new Map<string, { term: string; surface: Surface; days: Map<string, Day> }>();
  let minIso: string | null = null;
  let maxIso: string | null = null;
  for (const r of daily) {
    if (r.usersDaily === null || r.usersDaily === undefined) continue;
    const iso = isoOf(r.snapshotDate);
    if (!iso) continue;
    const key = `${r.surface}|${r.searchTerm.toLowerCase()}`;
    let s = series.get(key);
    if (!s) {
      s = { term: r.searchTerm, surface: r.surface, days: new Map() };
      series.set(key, s);
    }
    const d = s.days.get(iso) ?? { users: 0, posW: 0, posN: 0 };
    const u = Number(r.usersDaily) || 0;
    d.users += u;
    if (r.posDaily !== null && r.posDaily !== undefined && Number.isFinite(r.posDaily) && u > 0) {
      d.posW += r.posDaily * u;
      d.posN += u;
    }
    s.days.set(iso, d);
    if (!minIso || iso < minIso) minIso = iso;
    if (!maxIso || iso > maxIso) maxIso = iso;
  }
  if (!minIso || !maxIso) return [];

  const out: HistoryRow[] = [];
  const start = Date.parse(minIso);
  const end = Date.parse(maxIso);
  for (const s of Array.from(series.values())) {
    // Cửa sổ trượt: thêm ngày mới, bỏ ngày cách 7 ngày.
    const win: Day[] = [];
    let users = 0, posW = 0, posN = 0;
    for (let t = start; t <= end; t += DAY) {
      const iso = new Date(t).toISOString().slice(0, 10);
      const d = s.days.get(iso) ?? { users: 0, posW: 0, posN: 0 };
      win.push(d);
      users += d.users; posW += d.posW; posN += d.posN;
      if (win.length > 7) {
        const old = win.shift()!;
        users -= old.users; posW -= old.posW; posN -= old.posN;
      }
      // 6 ngày đầu của khoảng GA4 chưa đủ 7 ngày để cộng → bỏ, tab History cũ
      // (mergeHistory) bù đoạn đó; không thì chuỗi mở đầu bằng số thấp giả.
      if (users <= 0 || t < start + 6 * DAY) continue;
      out.push({
        snapshotDate: iso,
        searchTerm: s.term,
        surface: s.surface,
        usersL7D: users,
        posL7D: posN > 0 ? Math.round((posW / posN) * 100) / 100 : null,
        alert: 'OK',
      });
    }
  }
  return out;
}

/**
 * Ghép chuỗi dựng từ GA4 với tab History cũ: dòng cũ chỉ dùng cho ngày TRƯỚC
 * ngày đầu của GA4, để biểu đồ không mất đoạn tháng 5–6 khi GA4 mới giữ 100–200
 * ngày. Khi Apps Script ngừng ghi History, phần cũ tự mất dần, không gãy.
 */
export function mergeHistory(fromDaily: HistoryRow[], legacy: HistoryRow[]): HistoryRow[] {
  if (fromDaily.length === 0) return legacy;
  let first: string | null = null;
  for (const r of fromDaily) {
    const iso = isoOf(r.snapshotDate);
    if (iso && (!first || iso < first)) first = iso;
  }
  if (!first) return fromDaily;
  const older = legacy.filter((r) => {
    const iso = isoOf(r.snapshotDate);
    return iso !== null && iso < first!;
  });
  return older.length > 0 ? older.concat(fromDaily) : fromDaily;
}
