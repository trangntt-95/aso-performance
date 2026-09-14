// Keyword là tiếng nước nào: mã của sheet thắng; trống thì đoán theo bộ chữ;
// Latin không dấu → tiếng Anh; Latin có dấu → nói thẳng chưa xác định.
import { buildAndLoad } from './build.mjs';
const load = buildAndLoad();
const { languageOfKeyword, languageLabel } = await load('utils/language.js');
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};
const L = (k, c) => { const l = languageOfKeyword(k, c); return [l.code, l.source, languageLabel(l)]; };
eq('mã sheet thắng', L('gestão financeira', 'pt'), ['pt', 'sheet', 'Tiếng Bồ Đào Nha (pt)']);
// ü dùng chung Đức/Thổ → không đủ chắc để cãi sheet
eq('ü không đủ chắc → giữ mã sheet', L('ürün analiz', 'de'), ['de', 'sheet', 'Tiếng Đức (de)']);
// ı không chấm chỉ Thổ có → ghi đè sheet 'de'
const fixed = languageOfKeyword('kapıda ödeme', 'de');
eq('ı → Thổ, ghi đè sheet de', [fixed.code, fixed.source, fixed.sheetCode], ['tr', 'corrected', 'de']);
eq('ß → Đức, ghi đè sheet es', L('straße kosten', 'es'), ['de', 'corrected', 'Tiếng Đức (de)']);
eq('ñ → Tây Ban Nha, ghi đè sheet pt', L('ganancias del año', 'pt'), ['es', 'corrected', 'Tiếng Tây Ban Nha (es)']);
eq('ã → Bồ Đào Nha, khớp sheet → sheet', L('gestão', 'pt'), ['pt', 'sheet', 'Tiếng Bồ Đào Nha (pt)']);
eq('Hán nhưng sheet ghi es → sửa thành zh', L('数据分析', 'es'), ['zh', 'corrected', 'Tiếng Trung (zh)']);
eq('zh-tw vs zh cùng họ → không sửa', L('數據', 'zh-tw'), ['zh-tw', 'sheet', 'Tiếng Trung (phồn thể) (zh-tw)']);
eq('từ nối lấp chỗ trống: für → Đức', L('app für gewinn', ''), ['de', 'words', 'Tiếng Đức (de)']);
eq('từ nối KHÔNG ghi đè sheet', L('app für gewinn', 'es'), ['es', 'sheet', 'Tiếng Tây Ban Nha (es)']);
eq('từ nối hai ngôn ngữ cùng khớp → không đoán, về mặc định', L('per los', ''), ['en', 'default', 'Tiếng Anh (en)']);
eq('Latin có dấu, ü mà không mã → chưa xác định', L('steuer zoll gebühre', ''), ['', 'unknown', 'Chưa xác định']);

// Keyword thương hiệu: sheet đoán bừa → tiếng Anh
const B = (k, c, cat) => { const l = languageOfKeyword(k, c, cat); return [l.code, l.source, l.sheetCode ?? null]; };
eq('Brand + sheet es → sửa về en, giữ mã sheet', B('truprofit', 'es', 'Brand'), ['en', 'corrected', 'es']);
eq('Brand + sheet trống → en mặc định', B('truprofit', '', 'Brand'), ['en', 'default', null]);
eq('Brand + sheet en → sheet', B('trueprofit', 'en', 'Brand'), ['en', 'sheet', null]);
eq('Brand nhưng bộ chữ Thái → vẫn Thái', B('trueprofit ทรโปรฟต', 'th', 'Brand'), ['th', 'sheet', null]);
eq('Competitor + từ nối es → vẫn en (không tin từ nối với brand)', B('lifetimely para', 'es', 'Competitor'), ['en', 'corrected', 'es']);
eq('Feature + sheet es → theo sheet như cũ', B('ganancias', 'es', 'Feature'), ['es', 'sheet', null]);
eq('mã lạ → hiện mã', L('x', 'xx'), ['xx', 'sheet', 'Mã xx (xx)']);
eq('Hán → Trung', L('数据分析', ''), ['zh', 'script', 'Tiếng Trung (zh)']);
eq('Kana → Nhật (dù có Kanji)', L('利益トラッカー', ''), ['ja', 'script', 'Tiếng Nhật (ja)']);
eq('Hangul → Hàn', L('수익 분석', null), ['ko', 'script', 'Tiếng Hàn (ko)']);
eq('Thái', L('กำไร', ''), ['th', 'script', 'Tiếng Thái (th)']);
eq('Ả Rập', L('تحليل الربح', ''), ['ar', 'script', 'Tiếng Ả Rập (ar)']);
eq('Kirin → Nga', L('прибыль', ''), ['ru', 'script', 'Tiếng Nga (ru)']);
eq('dấu tiếng Việt', L('lợi nhuận', ''), ['vi', 'script', 'Tiếng Việt (vi)']);
eq('Latin không dấu, không mã → Anh mặc định', L('profit tracker', ''), ['en', 'default', 'Tiếng Anh (en)']);
eq('Latin có dấu, không mã → chưa xác định', L('comptabilité', ''), ['', 'unknown', 'Chưa xác định']);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
