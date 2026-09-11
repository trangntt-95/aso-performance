// Tab 'By categories' mọc thêm cột t9 (9/2026): số mốc và cột % growth phải
// đọc từ header, và tháng đang chạy phải được dán nhãn + đánh dấu chưa trọn.
//
// Trước sửa: parser cố định 8 mốc và growth ở cột T → t9 (dự phóng tháng 9)
// bị đọc thành % growth, và tháng 9 không xuất hiện ở đâu cả.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { parsePaidCategoryBoard } = await load('sheets/paidCategoryBoard.js');
const { buildTrendCube } = await load('market/paidCategoryTrend.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

// Excel serial: 46266 = 2026-09-01, 46274 = 2026-09-09 (đúng A1 live 11/09).
const K = 10; // cột K = index 10
const rightRow = (cat, vals, growth, note) => {
  const r = [];
  r[K] = cat;
  vals.forEach((v, i) => { r[K + 1 + i] = v; });
  if (growth !== undefined) r[K + 1 + vals.length] = growth;
  if (note !== undefined) r[K + 2 + vals.length] = note;
  return r;
};
const hdrRow = (n, growthLabel = '% growth') => {
  const r = [];
  r[K + 1 - 1] = undefined;
  for (let i = 0; i < n; i++) r[K + 1 + i] = `t${i + 1}`;
  r[K + 1 + n] = growthLabel;
  return r;
};
const labelRow = (label) => { const r = []; r[11] = label; return r; };

function grid(nPeriods, a1To) {
  const g = [];
  g[0] = ['Date range', 46266, a1To];
  // LEFT header ở hàng 7 (index 6) — cùng hàng với header t1..tN của tier đầu, như sheet thật
  const left = [null, 'Installs', 'Spend', 'CPI', 'Clicks', 'Impressions', 'CR', 'CPC', 'CTR', 'Pos'];
  const h = hdrRow(nPeriods);
  g[5] = labelRow('INSTALLS');
  g[6] = Object.assign([], left, h);
  const vals = (base) => Array.from({ length: nPeriods }, (_, i) => base + i);
  g[7] = Object.assign(['Brand', 6, 111.09, 18.5, 17, 321, 0.35, 6.53, 0.05, 0.74], rightRow('Brand', vals(10), 0.61, 'do CR'));
  g[8] = Object.assign(['Profit', 7, 271.06, 38.7, 29, 907, 0.24, 9.35, 0.03, 1.31], rightRow('Profit', vals(20), 0.31, 'good'));
  g[9] = rightRow(undefined, vals(30), 0.4); // totals
  g[10] = [];
  g[11] = labelRow('Spend');
  g[12] = hdrRow(nPeriods);
  g[13] = rightRow('Brand', vals(100), 0.17);
  g[14] = rightRow('Profit', vals(200), 0.34, 'Profit đang đà tăng');
  g[15] = [];
  g[16] = rightRow(undefined, vals(300), 0.2);
  g[17] = ['TOTAL', 13, 382.15];
  return g;
}

// ── 9 mốc, A1 = 1–9/9 (tháng đang chạy) ──
const b9 = parsePaidCategoryBoard(grid(9, 46274));
eq('9 mốc đọc từ header', b9.periods, ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9']);
eq('t9 là số liệu, không phải growth', b9.series[0].rows[0].values, [10, 11, 12, 13, 14, 15, 16, 17, 18]);
eq('growth đọc ở cột sau t9', b9.series[0].rows[0].growth, 0.61);
eq('totals 9 mốc + growth', [b9.series[0].totals.length, b9.series[0].totalsGrowth], [9, 0.4]);
eq('tháng: T1/26 → T9/26', b9.periodMonths, ['T1/26', 'T2/26', 'T3/26', 'T4/26', 'T5/26', 'T6/26', 'T7/26', 'T8/26', 'T9/26']);
eq('tháng 9 đang chạy, 9 ngày', b9.lastPeriodPartial, { from: '2026-09-01', to: '2026-09-09', days: 9 });
eq('tier Spend cũng 9 mốc', b9.series[1].rows[1].values.length, 9);
eq('snapshot trái không đổi', [b9.snapshot[0].category, b9.snapshot[0].installs, b9.snapshotTotal.installs], ['Brand', 6, 13]);

const c9 = buildTrendCube(b9);
eq('cube dùng nhãn tháng, có T9/26', c9.periods[c9.periods.length - 1], 'T9/26');
eq('cube mang cờ chưa trọn tháng', c9.lastPeriodPartial?.days, 9);

// ── 8 mốc, A1 = trọn tháng 8 (layout cũ) — hành vi cũ giữ nguyên ──
const g8 = grid(8, 46265); g8[0] = ["Date range", 46235, 46265]; // 01/08 → 31/08
const b8 = parsePaidCategoryBoard(g8);
eq('8 mốc như trước', b8.periods.length, 8);
eq('growth ở T như trước', b8.series[0].rows[0].growth, 0.61);
eq('tháng T1/26 → T8/26', [b8.periodMonths[0], b8.periodMonths[7]], ['T1/26', 'T8/26']);
eq('tháng trọn → không partial', b8.lastPeriodPartial, null);

// ── A1 không phải một tháng (30 ngày lăn) → không dán nhãn tháng ──
const gRoll = grid(9, 46274);
gRoll[0] = ['Date range', 46245, 46274]; // 11/08 → 09/09
const bRoll = parsePaidCategoryBoard(gRoll);
eq('cửa sổ lăn → giữ t1…t9, không partial', [bRoll.periodMonths, bRoll.lastPeriodPartial], [[], null]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
