import type { Category, KeywordRow, SearchTermRow, SheetPayload, SnapshotRow } from '@/lib/sheets/types';
import { normKw } from '@/lib/sheets/kwNorm';
import { buildPaidStatusIndex, resolvePaidStatus } from '@/lib/sheets/paidStatus';

// Câu người dùng gõ trên kênh paid mà mình chưa bid — lấy từ GA4, không từ
// export Shopify Ads.
//
// Shopify App Store chuyển nguyên câu người ta gõ sang GA4 qua surface_detail,
// kể cả khi câu đó lọt vào qua broad match của một keyword khác. Vì thế mọi
// dòng surface 'search_ad' trong All_L* / Country_L* đã là câu tìm kiếm thật:
// 'how to unlock my pos account', 'iphone 16', 'the shopify app for claude'
// không ai bid, chúng có mặt là vì broad match. Lọc những dòng đó qua Master
// KW Lookup là có ngay danh sách câu paid chưa bid — tự cập nhật mỗi ngày cùng
// tracker, không cần export tay.
//
// Vì sao GA4 làm nguồn chính còn export Shopify chỉ là lớp bổ sung: đo ngày
// 15/09/2026, tab Search_Term_Unbidded có 2.200 câu nhưng chỉ 7 câu có click,
// còn mọi câu GA4 thấy đều đã có người bấm (GA4 chỉ thấy câu khi có phiên).
// Bảng này xếp theo install để tìm câu đáng tách thành keyword exact, nên
// nguồn có install mới là nguồn đúng. Export Shopify giữ lại cho ba thứ GA4
// không có: impression (câu chỉ hiện chưa ai bấm), spend, và keyword/camp đã
// bắt được câu — ghép vào từng dòng khi trùng câu.
//
// Cũng đo hôm đó: 1.061 câu paid trong All_L* thì 724 đã là keyword trong
// Master, 20 trong KW_Added_Manual, 290 trong Negative, 27 chỉ còn ở camp đã
// tắt — không câu nào thật sự chưa xử lý. Tức là vòng "lấy search term → thêm
// keyword hoặc negative" đang được làm đều tay. Bảng này vì thế thường gần
// rỗng, và đó là trạng thái đúng: nó là danh sách việc tự đầy lên khi có câu
// mới, không phải kho để đào.
//
// Trạng thái dùng chung resolvePaidStatus với Paid Coverage, để cùng một câu
// không "chưa bid" ở bảng này mà "đang bid" ở bảng trên.

export type PaidTermWin = 'l7' | 'l30' | 'l90' | 'l365';
export const PAID_TERM_WINS: readonly PaidTermWin[] = ['l7', 'l30', 'l90', 'l365'];
export const PAID_TERM_WIN_LABEL: Record<PaidTermWin, string> = {
  l7: 'L7',
  l30: 'L30',
  l90: 'L90',
  l365: 'L365',
};

export interface PaidTermWinStat {
  users: number;
  installs: number;
  /** installs ÷ users, null khi chưa có user. */
  cr: number | null;
  /** Vị trí tốt nhất ghi nhận trong cửa sổ. */
  pos: number | null;
}

export interface PaidTermCountry {
  name: string;
  users: number;
  installs: number;
  pos: number | null;
}

/** Phần export Shopify Ads biết mà GA4 không biết, gộp mọi dòng cùng câu. */
export interface PaidTermExport {
  impressions: number;
  clicks: number;
  installs: number;
  spend: number;
  revenue: number;
  /** Keyword broad/phrase đã bắt được câu này — biết nên tách khỏi camp nào. */
  matchedKeywords: string[];
  camps: string[];
}

export interface PaidSearchTerm {
  term: string;
  english: string;
  category: Category;
  wins: Partial<Record<PaidTermWin, PaidTermWinStat>>;
  /** Nước có phiên paid cho câu này, theo cửa sổ, xếp theo install rồi users. */
  countriesByWin: Partial<Record<PaidTermWin, PaidTermCountry[]>>;
  /** Chỉ camp đã tắt từng bid câu này — hiện được nhưng cần nhãn riêng. */
  paused: boolean;
  pausedCamps: string[];
  /** Câu không có trong All_L*, chỉ có ở Country_L* — số là tổng các nước. */
  countryOnly: boolean;
  export: PaidTermExport | null;
}

export interface PaidSearchTermsReport {
  terms: PaidSearchTerm[];
  /** Số câu surface paid GA4 có, trước khi lọc trạng thái. */
  paidTermsTotal: number;
  /** Bỏ vì đang bid (Master hoặc KW_Added_Manual). */
  droppedInPaid: number;
  /** Bỏ vì nằm trong Negative KW list. */
  droppedNegative: number;
  /** Bỏ vì 0 users ở mọi cửa sổ — câu của kỳ trước còn sót dòng, không có gì để làm. */
  droppedNoTraffic: number;
  /** Khoảng ngày của export Shopify, để nói rõ lớp bổ sung cũ tới đâu. */
  exportRange: { from: string; to: string } | null;
  /** Câu export Shopify có click hoặc install mà GA4 không có — phần GA4 bỏ lỡ. */
  exportOnlyWithSignal: number;
}

const EMPTY: PaidSearchTermsReport = {
  terms: [],
  paidTermsTotal: 0,
  droppedInPaid: 0,
  droppedNegative: 0,
  droppedNoTraffic: 0,
  exportRange: null,
  exportOnlyWithSignal: 0,
};

const isPaid = (r: { surface: string }) => r.surface === 'search_ad';
const isRealCountry = (c: string | undefined): c is string => !!c && !c.startsWith('(');

export function buildPaidSearchTerms(data: SheetPayload | null | undefined): PaidSearchTermsReport {
  if (!data) return EMPTY;

  interface Acc {
    term: string;
    english: string;
    category: Category;
    wins: Partial<Record<PaidTermWin, PaidTermWinStat>>;
    countries: Partial<Record<PaidTermWin, Map<string, PaidTermCountry>>>;
  }
  const acc = new Map<string, Acc>();
  const ensure = (term: string, english: string, category: Category): Acc => {
    const k = normKw(term);
    let a = acc.get(k);
    if (!a) {
      a = { term: term.trim(), english, category, wins: {}, countries: {} };
      acc.set(k, a);
    }
    if (!a.english && english) a.english = english;
    if (a.category === 'Unknown' && category !== 'Unknown') a.category = category;
    return a;
  };
  const bestPos = (a: number | null, b: number | null): number | null => {
    if (a === null || a <= 0) return b !== null && b > 0 ? b : null;
    if (b === null || b <= 0) return a;
    return Math.min(a, b);
  };
  const addWin = (a: Acc, win: PaidTermWin, users: number, installs: number, pos: number | null) => {
    const w = a.wins[win] ?? { users: 0, installs: 0, cr: null, pos: null };
    w.users += users;
    w.installs += installs;
    w.pos = bestPos(w.pos, pos);
    w.cr = w.users > 0 ? w.installs / w.users : null;
    a.wins[win] = w;
  };
  const addCountry = (
    a: Acc,
    win: PaidTermWin,
    country: string,
    users: number,
    installs: number,
    pos: number | null,
  ) => {
    let m = a.countries[win];
    if (!m) {
      m = new Map();
      a.countries[win] = m;
    }
    const c = m.get(country) ?? { name: country, users: 0, installs: 0, pos: null };
    c.users += users;
    c.installs += installs;
    c.pos = bestPos(c.pos, pos);
    m.set(country, c);
  };

  // All_L*: một dòng cho mỗi câu × surface, không có nước.
  const ingestAll = (rows: KeywordRow[] | undefined, win: PaidTermWin) => {
    for (const r of rows ?? []) {
      if (!isPaid(r) || !r.searchTerm) continue;
      addWin(ensure(r.searchTerm, r.english, r.category), win, r.usersL, r.getAppL, r.posL);
    }
  };
  ingestAll(data.allL7, 'l7');
  ingestAll(data.allL30, 'l30');
  ingestAll(data.allL90, 'l90');
  for (const r of (data.allL365 ?? []) as SnapshotRow[]) {
    if (!isPaid(r) || !r.searchTerm) continue;
    addWin(ensure(r.searchTerm, r.english, r.category), 'l365', r.users, r.getApp, r.pos);
  }

  // Country_L*: cùng câu, tách theo nước.
  //
  // Câu All_L* đã có thì chỉ ghép nước vào, giữ nguyên số của All_L*. Câu CHỈ
  // có ở tab nước thì thêm vào universe với số cộng từ các nước: All_L30 và
  // All_L90 dừng đúng ở 500 dòng vì export cắt top, nên đuôi paid rơi khỏi
  // All_L* trước, trong khi Country_L90 giữ tới 3.000 dòng. Đo 15/09/2026: 986
  // câu paid chỉ có ở tab nước, 276 trong đó chưa nằm trong danh sách nào —
  // nhưng đều là câu của kỳ trước (usersL = 0), nên hôm nay không thêm dòng
  // nào; ngày mai một câu mới lọt vào đuôi thì bảng vẫn bắt được.
  const countryOnly = new Set<string>();
  const ensureFromCountry = (r: { searchTerm: string; english: string; category: Category }): Acc => {
    const k = normKw(r.searchTerm);
    const had = acc.has(k);
    const a = ensure(r.searchTerm, r.english, r.category);
    if (!had) countryOnly.add(k);
    return a;
  };
  const ingestCountry = (rows: KeywordRow[] | undefined, win: PaidTermWin) => {
    for (const r of rows ?? []) {
      if (!isPaid(r) || !r.searchTerm || !isRealCountry(r.country)) continue;
      const a = ensureFromCountry(r);
      if (countryOnly.has(normKw(r.searchTerm))) addWin(a, win, r.usersL, r.getAppL, r.posL);
      addCountry(a, win, r.country, r.usersL, r.getAppL, r.posL);
    }
  };
  ingestCountry(data.countryL7, 'l7');
  ingestCountry(data.countryL30, 'l30');
  ingestCountry(data.countryL90, 'l90');
  for (const r of (data.countryL365 ?? []) as SnapshotRow[]) {
    if (!isPaid(r) || !r.searchTerm || !isRealCountry(r.country)) continue;
    const a = ensureFromCountry(r);
    if (countryOnly.has(normKw(r.searchTerm))) addWin(a, 'l365', r.users, r.getApp, r.pos);
    addCountry(a, 'l365', r.country, r.users, r.getApp, r.pos);
  }

  // Lớp bổ sung từ export Shopify Ads, gộp theo câu.
  const exportBy = new Map<string, PaidTermExport>();
  for (const r of (data.searchTermUnbidded ?? []) as SearchTermRow[]) {
    const k = normKw(r.searchTerm ?? '');
    if (!k) continue;
    let e = exportBy.get(k);
    if (!e) {
      e = { impressions: 0, clicks: 0, installs: 0, spend: 0, revenue: 0, matchedKeywords: [], camps: [] };
      exportBy.set(k, e);
    }
    e.impressions += r.impressions ?? 0;
    e.clicks += r.clicks ?? 0;
    e.installs += r.installs ?? 0;
    e.spend += r.spend ?? 0;
    e.revenue += r.revenue ?? 0;
    if (r.matchedKeyword && !e.matchedKeywords.includes(r.matchedKeyword)) e.matchedKeywords.push(r.matchedKeyword);
    if (r.camp && !e.camps.includes(r.camp)) e.camps.push(r.camp);
  }

  const index = buildPaidStatusIndex(
    data.masterKwLookup ?? [],
    data.kwAddedManual ?? [],
    data.negativeKw ?? [],
    data.pausedKw ?? [],
  );

  const terms: PaidSearchTerm[] = [];
  let droppedInPaid = 0;
  let droppedNegative = 0;
  let droppedNoTraffic = 0;
  acc.forEach((a, k) => {
    const status = resolvePaidStatus(a.term, index);
    if (status.inPaid) {
      droppedInPaid++;
      return;
    }
    if (status.negative) {
      droppedNegative++;
      return;
    }
    // Tab giữ dòng của câu kỳ trước để hiện mức tụt (usersL = 0, usersP > 0).
    // Một câu như vậy không có traffic hiện tại ở bất kỳ cửa sổ nào tới 365
    // ngày thì không có gì để tách hay loại — bỏ, kẻo 276 dòng toàn số 0 che
    // mất vài dòng thật.
    if (!PAID_TERM_WINS.some((w) => (a.wins[w]?.users ?? 0) > 0)) {
      droppedNoTraffic++;
      return;
    }
    const countriesByWin: PaidSearchTerm['countriesByWin'] = {};
    for (const win of PAID_TERM_WINS) {
      const m = a.countries[win];
      if (!m) continue;
      countriesByWin[win] = Array.from(m.values()).sort(
        (x, y) => y.installs - x.installs || y.users - x.users || x.name.localeCompare(y.name),
      );
    }
    terms.push({
      term: a.term,
      english: a.english,
      category: a.category,
      wins: a.wins,
      countriesByWin,
      paused: status.paused,
      pausedCamps: status.pausedCamps ?? [],
      countryOnly: countryOnly.has(k),
      export: exportBy.get(k) ?? null,
    });
  });

  let exportOnlyWithSignal = 0;
  exportBy.forEach((e, k) => {
    if (!acc.has(k) && (e.clicks > 0 || e.installs > 0)) exportOnlyWithSignal++;
  });

  const range = data.searchTermRange;
  return {
    terms,
    paidTermsTotal: acc.size,
    droppedInPaid,
    droppedNegative,
    droppedNoTraffic,
    exportRange: range?.from && range?.to ? { from: range.from, to: range.to } : null,
    exportOnlyWithSignal,
  };
}

/** Số của một câu ở cửa sổ đã chọn, hoặc 0 khi câu không có trong tab đó. */
export function paidTermStat(t: PaidSearchTerm, win: PaidTermWin): PaidTermWinStat {
  return t.wins[win] ?? { users: 0, installs: 0, cr: null, pos: null };
}
