import { normKw } from '@/lib/sheets/kwNorm';
import { noteKeyOf } from './notesStore';

// Một note cho mỗi KEYWORD, dùng chung cho mọi bảng nói về keyword: Underbid,
// "Đang bid mà không ai bấm" (Paid Coverage), trend sheet, và cột note keyword
// bên cạnh camp (qua ghim ở Underbid).
//
// Scope giữ tên 'underbid' vì đó là nơi note keyword ra đời và App_Notes đã có
// hàng trăm dòng dưới scope này; đổi tên scope là mất sạch. Khoá là keyword
// chuẩn hoá (normKw: chữ thường, gộp khoảng trắng), vì cùng một keyword ba
// nguồn viết ba kiểu — GA4 "lifetimely profit  ltv" (hai dấu cách), Master
// "Wholesale Lock Manager" (viết hoa), trend sheet nhận tên từ bảng nào mở nó.
// Không chuẩn hoá thì note ghi ở bảng này mở bảng kia thấy ô trống, và cùng
// một keyword bị tăng bid hai lần.
//
// Note cũ ghi theo tên thô (trước 16/09/2026) vẫn đọc được qua khoá dự phòng;
// lần sửa kế tiếp NoteCell ghi về khoá chuẩn hoá.

export const KEYWORD_NOTE_SCOPE = 'underbid';

/** Khoá ghi của keyword — chữ thường, một dấu cách. */
export function keywordNoteId(term: string): string {
  return normKw(term);
}

export interface KeywordNoteKeys {
  id: string;
  primary: string;
  /** Khoá theo tên thô (khi khác khoá chuẩn), để đọc note ghi trước khi thống nhất. */
  legacy: string[];
}

export function keywordNoteKeys(term: string): KeywordNoteKeys {
  const id = keywordNoteId(term);
  const primary = noteKeyOf(KEYWORD_NOTE_SCOPE, id);
  const raw = noteKeyOf(KEYWORD_NOTE_SCOPE, term);
  return { id, primary, legacy: raw !== primary ? [raw] : [] };
}

/** Nội dung note: khoá chuẩn trước, không có thì khoá tên thô. */
export function readKeywordNote(notes: Record<string, string>, term: string): string {
  const k = keywordNoteKeys(term);
  const primary = notes[k.primary];
  if (primary) return primary;
  for (const key of k.legacy) if (notes[key]) return notes[key];
  return '';
}

// ── Camp đã ghim cho keyword ──────────────────────────────────────────────────
//
// Cùng một keyword thường chạy ở nhiều camp (một camp mỗi tier geo); "ghim" là
// Trang đánh dấu camp nào mình thật sự chỉnh bid cho keyword đó. Ghim ra đời
// ở Underbid, giờ dùng chung với Vị trí keyword và Paid Coverage. Scope riêng
// khỏi note để bấm ghim không đụng updatedAt của note (mốc đo Impact bid).
// Giá trị: tên camp, mỗi dòng một tên (tên camp không bao giờ có xuống dòng).

export const KEYWORD_PIN_SCOPE = 'underbid-camp';

export function keywordPinKeys(term: string): KeywordNoteKeys {
  const id = keywordNoteId(term);
  const primary = noteKeyOf(KEYWORD_PIN_SCOPE, id);
  const raw = noteKeyOf(KEYWORD_PIN_SCOPE, term);
  return { id, primary, legacy: raw !== primary ? [raw] : [] };
}

const splitPins = (v: string | undefined): string[] =>
  (v || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

/** Camp đã ghim cho keyword — hợp khoá chuẩn và khoá tên thô, bỏ trùng, giữ thứ tự. */
export function readPinnedCamps(notes: Record<string, string>, term: string): string[] {
  const k = keywordPinKeys(term);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of [k.primary, ...k.legacy]) {
    for (const camp of splitPins(notes[key])) {
      const id = camp.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(camp);
    }
  }
  return out;
}

/** Danh sách ghim sau khi bật/tắt một camp, dạng lưu (mỗi dòng một tên). */
export function togglePinnedCamp(current: string[], camp: string): string {
  const has = current.some((c) => c.toLowerCase() === camp.toLowerCase());
  const next = has ? current.filter((c) => c.toLowerCase() !== camp.toLowerCase()) : [...current, camp];
  return next.join('\n');
}

// ── Note và ghim theo KEYWORD × NƯỚC ──────────────────────────────────────────
//
// Vị trí keyword có dòng là keyword × nước; "profit ở Úc" và "profit ở Tây Ban
// Nha" là hai việc khác nhau (camp khác, bid khác), nên note và ghim ở tab đó
// khoá theo cả nước. Note keyword (không nước) vẫn là của Underbid; hai lớp
// đọc chéo nhau nhưng không ghi lên nhau: tab theo nước hiện note keyword
// đọc-chỉ, tab theo keyword hiện danh sách note theo nước đọc-chỉ.
// Khoá: '<keyword chuẩn hoá>|<tên nước như Country_L*>'.

export const KEYWORD_COUNTRY_NOTE_SCOPE = 'kw-country';
export const KEYWORD_COUNTRY_PIN_SCOPE = 'kw-country-camp';
const COUNTRY_SEP = '|';

export function keywordCountryId(term: string, country: string): string {
  return `${keywordNoteId(term)}${COUNTRY_SEP}${country.trim()}`;
}

export interface KeywordCountryNote {
  country: string;
  note: string;
  pins: string[];
}

/** Mọi note / ghim theo nước của một keyword, xếp theo tên nước. */
export function readKeywordCountryNotes(notes: Record<string, string>, term: string): KeywordCountryNote[] {
  const notePrefix = noteKeyOf(KEYWORD_COUNTRY_NOTE_SCOPE, keywordNoteId(term)) + COUNTRY_SEP;
  const pinPrefix = noteKeyOf(KEYWORD_COUNTRY_PIN_SCOPE, keywordNoteId(term)) + COUNTRY_SEP;
  const byCountry = new Map<string, KeywordCountryNote>();
  const get = (country: string) => {
    let e = byCountry.get(country);
    if (!e) {
      e = { country, note: '', pins: [] };
      byCountry.set(country, e);
    }
    return e;
  };
  for (const [key, value] of Object.entries(notes)) {
    if (!value) continue;
    if (key.startsWith(notePrefix)) get(key.slice(notePrefix.length)).note = value.trim();
    else if (key.startsWith(pinPrefix)) get(key.slice(pinPrefix.length)).pins = splitPins(value);
  }
  return Array.from(byCountry.values())
    .filter((e) => e.note || e.pins.length > 0)
    .sort((a, b) => a.country.localeCompare(b.country));
}

/**
 * Lần ghi note mới nhất trên mọi khoá của keyword, ISO string — mốc đo
 * trước/sau của Impact bid. Lấy MỚI NHẤT chứ không lấy theo thứ tự khoá, để
 * ghi lại note ở bảng nào cũng đẩy mốc đo tiến lên.
 */
export function readKeywordNoteAt(updatedAt: Record<string, string>, term: string): string | undefined {
  const k = keywordNoteKeys(term);
  let best: string | undefined;
  let bestMs = -Infinity;
  for (const key of [k.primary, ...k.legacy]) {
    const ts = updatedAt[key];
    if (!ts) continue;
    const ms = new Date(ts).getTime();
    if (!Number.isFinite(ms) || ms <= bestMs) continue;
    bestMs = ms;
    best = ts;
  }
  return best;
}
