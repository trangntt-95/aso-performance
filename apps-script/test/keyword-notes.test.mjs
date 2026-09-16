// Note keyword dùng chung: khoá chuẩn hoá + đọc dự phòng khoá tên thô.
//
// Vì sao: Underbid, "Đang bid mà không ai bấm" và trend sheet nhận cùng một
// keyword từ ba nguồn viết ba kiểu (GA4 hai dấu cách, Master viết hoa). Khoá
// theo tên thô thì note ghi ở bảng này mở bảng kia trống.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { keywordNoteKeys, readKeywordNote, readKeywordNoteAt, KEYWORD_NOTE_SCOPE } = await load('store/keywordNotes.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

eq('scope giữ tên cũ để không mất note đã ghi', KEYWORD_NOTE_SCOPE, 'underbid');
eq('Master viết hoa và GA4 chữ thường → cùng khoá', keywordNoteKeys('Wholesale Lock Manager').primary, keywordNoteKeys('wholesale lock manager').primary);
eq('hai dấu cách → cùng khoá', keywordNoteKeys('lifetimely profit  ltv').primary, 'underbid||lifetimely profit ltv');
eq('tên thô khác khoá chuẩn → có khoá dự phòng', keywordNoteKeys('lifetimely profit  ltv').legacy, ['underbid||lifetimely profit  ltv']);
eq('tên đã chuẩn → không có dự phòng', keywordNoteKeys('be profit').legacy, []);

const notes = {
  'underbid||be profit': 'tăng bid $13 → $16 ngày 16/09',
  'underbid||lifetimely profit  ltv': 'note cũ ghi theo tên thô',
};
eq('đọc từ bảng khác với tên viết hoa', readKeywordNote(notes, 'Be Profit'), 'tăng bid $13 → $16 ngày 16/09');
eq('note cũ theo tên thô vẫn đọc được', readKeywordNote(notes, 'lifetimely profit  ltv'), 'note cũ ghi theo tên thô');
eq('không có → chuỗi rỗng', readKeywordNote(notes, 'mida'), '');

const at = {
  'underbid||lifetimely profit ltv': '2026-09-10T00:00:00.000Z',
  'underbid||lifetimely profit  ltv': '2026-09-15T00:00:00.000Z',
};
eq('mốc đo = lần ghi MỚI NHẤT trên mọi khoá', readKeywordNoteAt(at, 'lifetimely profit  ltv'), '2026-09-15T00:00:00.000Z');
eq('không có mốc → undefined', readKeywordNoteAt(at, 'mida'), undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
