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
eq('mã sheet kể cả khi sai bộ chữ', L('ürün analiz', 'de'), ['de', 'sheet', 'Tiếng Đức (de)']);
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
