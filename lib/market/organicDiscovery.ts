import type { SheetPayload, SnapshotRow } from '@/lib/sheets/types';
import { normKw } from '@/lib/sheets/kwNorm';

// Search term organic có trong snapshot ngày mà KHÔNG có trong All_L*.
//
// Vì sao cần: Paid Coverage dựng universe từ All_L7 ∪ L30 ∪ L90 ∪ L365, và tab
// All_L30/All_L90 của sheet dừng đúng ở 500 dòng — export cắt top 500. Dòng
// paid chiếm gần hết chỗ đó (458/500 ở L30), nên phần bị cắt đầu tiên chính là
// đuôi organic, tức là đúng phần "keyword có người tìm mà mình chưa mua".
//
// Đo trên data thật: universe hiện tại có 1.223 term, trong đó 1.083 đã từng
// chạy paid; chỉ 4 term là organic-only và không có trong Master KW Lookup —
// cả 4 đều là lỗi chính tả ('upprofit', 'tureprofi'). Danh sách "chưa bid"
// rỗng như vậy không có nghĩa là hết cơ hội, mà là đuôi không tới được đây.
//
// History_Daily thì không bị cắt: nó giữ 393 term organic mà All_L* không có —
// 'marketing attribution', 'polar analytics', 'customer lifetime value',
// 'inventory management', 'profit margin analysis'. Volume nhỏ (1–6 users) và
// đó là bản chất của đuôi, không phải lỗi đo; nhưng chúng là truy vấn thật của
// người thật, và là thứ duy nhất trên dashboard cho biết người ta đang tìm gì
// mà mình chưa có mặt.
//
// ── Vì sao chỉ lấy số từ cột per-day ───────────────────────────────────────
// History_Daily có hai khối: usersDaily (per-day thật, cộng được) và usersL7D
// (rolling 7 ngày, KHÔNG cộng được — cộng 7 ngày liền nhau là đếm mỗi user tới
// bảy lần). 506 trong 581 dòng đuôi có usersDaily, nên số ở đây chỉ lấy từ cột
// đó. Term nào chỉ xuất hiện trong History (chỉ có rolling) thì vẫn được nêu
// tên nhưng không mang số cộng — mang riêng đỉnh rolling, có nhãn riêng, vì
// trộn hai thước đo vào cùng một cột là cách chắc nhất để người đọc so hai số
// không so được với nhau.

export type DiscoveryWin = 'l7' | 'l30' | 'l90' | 'l365';

/** Cửa sổ tính theo số ngày lùi từ ngày mới nhất có trong snapshot. */
const WIN_DAYS: Record<DiscoveryWin, number> = { l7: 7, l30: 30, l90: 90, l365: 365 };

export interface DiscoveredTerm {
  keyword: string;
  /** Users/install cộng từ cột per-day, theo từng cửa sổ (cộng dồn như All_L*). */
  wins: Partial<Record<DiscoveryWin, { users: number; installs: number }>>;
  /** Đỉnh usersL7D — chỉ có khi term không có dòng per-day nào. Không cộng được. */
  rollingUsersMax: number | null;
  /** Vị trí organic tốt nhất từng thấy. */
  bestPos: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Tab đã tìm ra term này. */
  from: 'History_Daily' | 'History';
}

export interface OrganicDiscovery {
  terms: DiscoveredTerm[];
  /** Ngày mới nhất trong snapshot — mốc để tính cửa sổ, không phải hôm nay. */
  asOf: string | null;
  /** Số term của universe All_L*, để nói được phần thêm vào lớn cỡ nào. */
  knownTerms: number;
  /** Tab All_L* nào đang dừng đúng ở giới hạn export — lý do có đuôi bị thiếu. */
  cappedTabs: { tab: string; rows: number }[];
}

/**
 * Ngày của một dòng snapshot → 'YYYY-MM-DD'.
 *
 * Cột này có cả chuỗi ISO và serial Excel trong cùng một tab (đo trên data
 * thật: '2026-02-01' và 46244 nằm cạnh nhau), nên phải nhận cả hai. Serial
 * quy về UTC để một ngày không bị lệch sang ngày khác theo múi giờ người xem.
 */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Dải serial coi là ngày thật: ~1954 đến ~2119. Ngoài dải là ô nhập sai. */
const inSerialBand = (n: number): boolean => n > 20000 && n < 80000;
const serialToIso = (n: number): string =>
  new Date(EXCEL_EPOCH_MS + n * 86400000).toISOString().slice(0, 10);

export function snapshotDateIso(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  // Cùng dải hợp lý cho cả số và chuỗi: một ô lỡ chứa 3 thì 3 ngày sau epoch
  // Excel là 1900-01-02, và con số đó sẽ hiện nguyên trong tooltip 'thấy từ'.
  if (typeof v === 'number' && Number.isFinite(v)) {
    return inSerialBand(v) ? serialToIso(v) : null;
  }
  const s = String(v).trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (iso) return iso[1];
  const n = Number(s);
  // Serial sau khi qua JSON là chuỗi số — 46244 chứ không phải 46244.0.
  if (Number.isFinite(n) && inSerialBand(n)) return serialToIso(n);
  return null;
}

const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);

/** Tab All_L* nào dừng đúng ở một con số tròn — dấu hiệu bị export cắt. */
const CAP_SIZES = new Set([500, 1000, 2000, 3000, 5000]);

export function buildOrganicDiscovery(
  data: SheetPayload | null | undefined,
): OrganicDiscovery | null {
  if (!data) return null;

  // ── Universe hiện tại: mọi term trong All_L*, cả hai surface ──
  // Cả hai surface, vì câu hỏi là "term này đã có trong All_L* chưa", không
  // phải "nó có traffic organic chưa".
  const known = new Set<string>();
  const addKnown = (term: string) => {
    const k = normKw(term ?? '');
    if (k) known.add(k);
  };
  for (const r of data.allL3 ?? []) addKnown(r.searchTerm);
  for (const r of data.allL7 ?? []) addKnown(r.searchTerm);
  for (const r of data.allL14 ?? []) addKnown(r.searchTerm);
  for (const r of data.allL30 ?? []) addKnown(r.searchTerm);
  for (const r of data.allL90 ?? []) addKnown(r.searchTerm);
  for (const r of (data.allL365 ?? []) as SnapshotRow[]) addKnown(r.searchTerm);

  const historyDaily = (data.historyDaily ?? []).filter((r) => r.surface !== 'search_ad');
  const history = (data.history ?? []).filter((r) => r.surface !== 'search_ad');
  if (historyDaily.length === 0 && history.length === 0) return null;

  // Mốc là ngày mới nhất CÓ TRONG snapshot, không phải hôm nay: export luôn
  // trễ một hai ngày, lấy hôm nay làm mốc thì cửa sổ L7 mất mấy ngày đầu.
  let asOf: string | null = null;
  const bump = (iso: string | null) => {
    if (iso && (!asOf || iso > asOf)) asOf = iso;
  };
  for (const r of historyDaily) bump(snapshotDateIso(r.snapshotDate));
  for (const r of history) bump(snapshotDateIso(r.snapshotDate));
  if (!asOf) return null;

  interface Acc {
    keyword: string;
    wins: Partial<Record<DiscoveryWin, { users: number; installs: number }>>;
    rollingUsersMax: number | null;
    hasPerDay: boolean;
    bestPos: number | null;
    firstSeen: string | null;
    lastSeen: string | null;
    from: 'History_Daily' | 'History';
  }
  const acc = new Map<string, Acc>();
  const ensure = (term: string, from: Acc['from']): Acc | null => {
    const k = normKw(term ?? '');
    if (!k || known.has(k)) return null;
    let a = acc.get(k);
    if (!a) {
      a = {
        keyword: (term ?? '').trim(),
        wins: {},
        rollingUsersMax: null,
        hasPerDay: false,
        bestPos: null,
        firstSeen: null,
        lastSeen: null,
        from,
      };
      acc.set(k, a);
    }
    return a;
  };
  const seenOn = (a: Acc, iso: string) => {
    if (!a.firstSeen || iso < a.firstSeen) a.firstSeen = iso;
    if (!a.lastSeen || iso > a.lastSeen) a.lastSeen = iso;
  };

  for (const r of historyDaily) {
    const a = ensure(r.searchTerm, 'History_Daily');
    if (!a) continue;
    const iso = snapshotDateIso(r.snapshotDate);
    if (!iso) continue;
    seenOn(a, iso);
    if (r.posDaily != null && (a.bestPos === null || r.posDaily < a.bestPos)) a.bestPos = r.posDaily;
    if (r.usersDaily === null || r.usersDaily === undefined) continue;
    a.hasPerDay = true;
    const age = daysBetween(iso, asOf);
    if (age < 0) continue; // dòng có ngày sau mốc: bỏ, không đoán
    for (const win of Object.keys(WIN_DAYS) as DiscoveryWin[]) {
      if (age > WIN_DAYS[win]) continue;
      const cur = a.wins[win] ?? { users: 0, installs: 0 };
      cur.users += r.usersDaily ?? 0;
      cur.installs += r.getAppDaily ?? 0;
      a.wins[win] = cur;
    }
  }

  for (const r of history) {
    const a = ensure(r.searchTerm, 'History');
    if (!a) continue;
    const iso = snapshotDateIso(r.snapshotDate);
    if (iso) seenOn(a, iso);
    if (r.posL7D != null && (a.bestPos === null || r.posL7D < a.bestPos)) a.bestPos = r.posL7D;
    const u = r.usersL7D ?? 0;
    if (u > (a.rollingUsersMax ?? 0)) a.rollingUsersMax = u;
  }

  const terms: DiscoveredTerm[] = [];
  acc.forEach((a) => {
    // Term không có số nào ở cả hai khối thì không nói được gì — bỏ, thay vì
    // đưa vào danh sách một dòng toàn dấu gạch.
    const anyUsers = Object.values(a.wins).some((w) => w.users > 0);
    if (!anyUsers && !(a.rollingUsersMax && a.rollingUsersMax > 0)) return;
    terms.push({
      keyword: a.keyword,
      wins: a.wins,
      // Đỉnh rolling chỉ báo ra khi term không có số per-day nào: có per-day
      // rồi thì thêm một thước đo thứ hai chỉ gây so sai.
      rollingUsersMax: a.hasPerDay ? null : a.rollingUsersMax,
      bestPos: a.bestPos,
      firstSeen: a.firstSeen,
      lastSeen: a.lastSeen,
      from: a.from,
    });
  });

  // Sắp theo users L365 rồi tới đỉnh rolling — đuôi nào dày nhất lên trước.
  terms.sort(
    (x, y) =>
      (y.wins.l365?.users ?? 0) - (x.wins.l365?.users ?? 0) ||
      (y.rollingUsersMax ?? 0) - (x.rollingUsersMax ?? 0),
  );

  const cappedTabs = (
    [
      ['All_L30', (data.allL30 ?? []).length],
      ['All_L90', (data.allL90 ?? []).length],
      ['All_L365', ((data.allL365 ?? []) as SnapshotRow[]).length],
    ] as [string, number][]
  )
    .filter(([, rows]) => CAP_SIZES.has(rows))
    .map(([tab, rows]) => ({ tab, rows }));

  return { terms, asOf, knownTerms: known.size, cappedTabs };
}
