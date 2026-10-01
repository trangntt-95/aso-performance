// Nhãn hiển thị của một camp gộp được về Camp_Links phải là TÊN HIỆN TẠI trong
// Camp_Links, không phải nhãn ngắn nhất trong export.
//
// Vì sao: "TP - Profit - Exact 01 - Tier 1 - NL" có trong Camp_Links, nhưng
// export còn 42 ngày tên cũ "… Tier 2 - NL" (trước khi đổi tier). Hai tên dài
// bằng nhau, tên cũ đến trước, nên Camp Health hiện camp dưới tên cũ và tìm
// "Tier 1 - NL" không ra gì (01/10/2026).
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildCampGrouper } = await load('sheets/campGroup.js');
const { analyseCampHealth } = await load('market/campHealth.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

const LINKS = [
  { camp: 'TP - Profit - Exact 01 - Tier 1 - NL', url: 'u1', campaignId: '74102' },
  { camp: 'TP - Brandname - Exact - US', url: 'u2', campaignId: '1', aliases: ['TP - Brandname - Exact - US - old suffix'] },
];
const observed = [
  'TP - Profit - Exact 01 - Tier 2 - NL', // tên cũ, đến trước
  'TP - Profit - Exact 01 - Tier 1 - NL (net value 64$)',
  'TP - Profit - Exact 01 - Tier 1 - NL',
  'TP - Brandname - Exact - US - old suffix (CPI 9)',
  '[12.04] Test potential KW Apr - test till Sep',
  '[12.04] Test potential KW Apr',
];
const g = buildCampGrouper(observed, LINKS);
const kNL = g.key('TP - Profit - Exact 01 - Tier 2 - NL');
eq('ba nhãn NL về một key', [g.key('TP - Profit - Exact 01 - Tier 1 - NL (net value 64$)'), g.key('TP - Profit - Exact 01 - Tier 1 - NL')], [kNL, kNL]);
eq('nhãn = tên Camp_Links, không phải tên cũ Tier 2', g.label(kNL), 'TP - Profit - Exact 01 - Tier 1 - NL');
eq('alias → nhãn là tên hiện tại', g.label(g.key('TP - Brandname - Exact - US - old suffix (CPI 9)')), 'TP - Brandname - Exact - US');
eq('camp ngoài Camp_Links vẫn lấy nhãn ngắn nhất', g.label(g.key('[12.04] Test potential KW Apr - test till Sep')), '[12.04] Test potential KW Apr');

// Qua Camp Health: tìm theo tên Camp_Links phải thấy đúng một dòng gộp đủ spend.
const day = (date, camp, impressions, clicks, installs, spend) => ({ date, camp, impressions, clicks, installs, spend, position: null, visibility: null });
const rows = [];
for (let d = 1; d <= 14; d++) {
  const date = `2026-09-${String(d).padStart(2, '0')}`;
  rows.push(day(date, d <= 7 ? 'TP - Profit - Exact 01 - Tier 2 - NL' : 'TP - Profit - Exact 01 - Tier 1 - NL (net value 64$)', 10, 1, 0, 5));
}
const r = analyseCampHealth(rows, { windowDays: 7, canonicalNames: LINKS });
const nl = r.rows.filter((x) => x.camp.toLowerCase().includes('exact 01'));
eq('một dòng duy nhất', nl.length, 1);
eq('dòng mang tên Camp_Links', nl[0].camp, 'TP - Profit - Exact 01 - Tier 1 - NL');
eq('spend kỳ này + kỳ trước gộp đủ', [nl[0].cur.spend, nl[0].prev.spend], [35, 35]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
