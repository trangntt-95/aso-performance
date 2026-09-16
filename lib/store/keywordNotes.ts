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
