// Camp Health: bucket 'pricey' và 'scale' so với trần cho phép của camp (capOf)
// thay cho trung vị tài khoản, và 'pricey' đứng trước 'rising'.
//
// Vì sao: cùng camp Profit ES, Overbid đỏ (CPI +133% so trần) trong khi Camp
// Health xếp 'rising' và khuyên nới ngân sách. Trung vị là thước tương đối —
// một camp đắt gấp rưỡi trung vị vẫn có thể rẻ hơn giá trị install ở Mỹ.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { analyseCampHealth } = await load('market/campHealth.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

// 14 ngày: kỳ trước 01–07, kỳ này 08–14.
const day = (date, camp, impressions, clicks, installs, spend) => ({ date, camp, impressions, clicks, installs, spend, position: null, visibility: null });
const rows = [];
for (let d = 1; d <= 14; d++) {
  const date = `2026-09-${String(d).padStart(2, '0')}`;
  const cur = d >= 8;
  // A: CPI $30 mỗi kỳ, đang lên (imp ×2, install 2→4) — trần $20 → pricey, không rising
  rows.push(day(date, 'A', cur ? 200 : 100, 10, cur ? 4 / 7 : 2 / 7, cur ? 120 / 7 : 60 / 7));
  // B: CPI $30, trần $45 → không đắt; rising vì imp ×2 và install tăng
  rows.push(day(date, 'B', cur ? 200 : 100, 10, cur ? 4 / 7 : 2 / 7, cur ? 120 / 7 : 60 / 7));
  // C: CPI $8, trần $45 → dưới nửa trần → scale
  rows.push(day(date, 'C', 100, 10, 4 / 7, 32 / 7));
  // D: CPI $30, không có trần; trung vị sẽ là ~$30 → không pricey theo trung vị
  rows.push(day(date, 'D', 100, 10, 2 / 7, 60 / 7));
}
const cap = { A: 20, B: 45, C: 45, D: null };
const r = analyseCampHealth(rows, { windowDays: 7, capOf: (c) => cap[c] ?? null });
const by = Object.fromEntries(r.rows.map((x) => [x.camp, x]));

eq('A: CPI $30 > trần $20 → pricey, dù đang lên', by.A.bucket, 'pricey');
eq('A: lý do nêu trần và nói đang lên nhưng siết bid', /trần cho phép \$20\.00/.test(by.A.reason) && /đang lên/.test(by.A.reason), true);
eq('A: at-risk = phần vượt trần = 120 − 4×20', Math.round(by.A.atRisk), 40);
eq('B: CPI $30 < trần $45, đang lên → rising', by.B.bucket, 'rising');
eq('C: CPI $8 < nửa trần $45 → scale', by.C.bucket, 'scale');
eq('D: không có trần → so trung vị, $30 không gấp 1,5 trung vị → không pricey', by.D.bucket === 'pricey', false);

// Camp có dòng trong export nhưng $0 cả hai kỳ (chỉ vài impression, 0 click):
// trước 16/09/2026 bị `continue` và cũng không được xếp 'silent' vì đã có mặt
// trong export → biến mất khỏi bảng (Ordermetrics). Giờ phải là 'silent'.
{
  const quiet = [...rows];
  for (let d = 1; d <= 14; d++) quiet.push(day(`2026-09-${String(d).padStart(2, '0')}`, 'E', d === 3 || d === 12 ? 1 : 0, 0, 0, 0));
  const rq = analyseCampHealth(quiet, { windowDays: 7, capOf: (c) => cap[c] ?? null, knownCamps: ['E', 'F'] });
  const byQ = Object.fromEntries(rq.rows.map((x) => [x.camp, x]));
  eq('E: có impression, 0 click, $0 cả hai kỳ → silent, không biến mất', byQ.E?.bucket, 'silent');
  eq('E: lý do nêu số impression', /1 lượt hiển thị/.test(byQ.E?.reason ?? ''), true);
  eq('F: không có dòng nào trong export → silent như cũ', byQ.F?.bucket, 'silent');
  eq('A vẫn pricey, không bị ảnh hưởng', byQ.A.bucket, 'pricey');
}

// Không truyền capOf → hành vi cũ theo trung vị.
const old = analyseCampHealth(rows, { windowDays: 7 });
const byOld = Object.fromEntries(old.rows.map((x) => [x.camp, x]));
eq('không có capOf: A không pricey (CPI = trung vị), rising như trước', byOld.A.bucket, 'rising');
eq('không có capOf: C rẻ hơn trung vị → scale', byOld.C.bucket, 'scale');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
