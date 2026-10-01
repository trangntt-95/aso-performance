// Camp Health: nhóm 'tiny' — cả đời (toàn bộ export theo ngày) tiêu chưa tới
// $15 và không nằm trong Paused_camp. Thắng mọi nhóm theo kỳ (burning, idle,
// silent…) vì ở mức đó nhãn theo kỳ là nhiễu; camp đã tắt thì đi tiếp xuống
// paused như cũ. Trang 01/10/2026: "camp nào all time chỉ spend < $15?".
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { analyseCampHealth, TINY_LIFETIME_SPEND, BUCKET_META } = await load('market/campHealth.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

const day = (date, camp, impressions, clicks, installs, spend) => ({ date, camp, impressions, clicks, installs, spend, position: null, visibility: null });
const rows = [];
for (let d = 1; d <= 60; d++) {
  const date = `2026-08-${String(d).padStart(2, '0')}`.replace(/08-(\d\d)$/, (_, x) => (Number(x) <= 31 ? `08-${x}` : `09-${String(Number(x) - 31).padStart(2, '0')}`));
  const cur = d > 53; // 7 ngày cuối = kỳ này
  // A: cả đời $12, kỳ này $4 qua 2 click, 0 install → tiny (không phải burning)
  rows.push(day(date, 'A', 10, d === 60 ? 2 : 0, 0, cur ? 4 / 7 : 8 / 53));
  // B: cả đời $8, kỳ này $0, kỳ trước $0 → tiny (không phải silent)
  rows.push(day(date, 'B', 5, 0, 0, d <= 30 ? 8 / 30 : 0));
  // C: cả đời $8, nằm trong Paused_camp → paused, không tiny
  rows.push(day(date, 'C', 5, 0, 0, d <= 30 ? 8 / 30 : 0));
  // D: cả đời $100, kỳ này $20 qua 5 click, 0 install → burning như cũ
  rows.push(day(date, 'D', 100, cur ? 5 / 7 : 0, 0, cur ? 20 / 7 : 80 / 53));
  // E: cả đời $14.99 nhưng kỳ này đang lên → vẫn tiny (ngưỡng là cả đời)
  rows.push(day(date, 'E', 10, cur ? 1 / 7 : 0, cur ? 1 / 7 : 0, cur ? 14.99 / 7 : 0));
}
const r = analyseCampHealth(rows, { windowDays: 7, pausedCamps: ['C'] });
const by = Object.fromEntries(r.rows.map((x) => [x.camp, x]));

eq('ngưỡng mặc định $15', TINY_LIFETIME_SPEND, 15);
eq('A: cả đời $12, click 0 install → tiny thắng burning', by.A.bucket, 'tiny');
eq('A: at-risk = spend kỳ này', Math.round(by.A.atRisk), 4);
eq('A: lý do nêu cả đời và ngày đầu', /Cả đời \(từ 2026-08-01\) chỉ tiêu \$12\.00/.test(by.A.reason), true);
eq('A: lifetime đúng', [Math.round(by.A.lifetime.spend), by.A.lifetime.installs, by.A.lifetime.from, by.A.lifetime.to], [12, 0, '2026-08-01', '2026-09-29']);
eq('B: cả đời $8, $0 hai kỳ → tiny thắng silent', by.B.bucket, 'tiny');
eq('C: cả đời $8 nhưng đã tắt → paused', by.C.bucket, 'paused');
eq('D: cả đời $100 → burning như cũ', by.D.bucket, 'burning');
eq('D: lifetime vẫn có trên dòng thường', Math.round(by.D.lifetime.spend), 100);
eq('E: cả đời $14.99 → tiny dù kỳ này có install', by.E.bucket, 'tiny');
eq('BUCKET_META có tiny, tone warn', BUCKET_META.tiny?.tone, 'warn');

// Ngưỡng tuỳ chỉnh
const r2 = analyseCampHealth(rows, { windowDays: 7, pausedCamps: ['C'], tinySpend: 10 });
const by2 = Object.fromEntries(r2.rows.map((x) => [x.camp, x]));
eq('tinySpend 10: A ($12) không còn tiny → burning', by2.A.bucket, 'burning');
eq('tinySpend 10: B ($8) vẫn tiny', by2.B.bucket, 'tiny');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
