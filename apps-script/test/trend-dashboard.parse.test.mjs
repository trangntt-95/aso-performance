// Acceptance test for apps-script/trend-dashboard.gs (§9 of the handoff).
//
// The .gs source is loaded and evaluated as-is, so the code under test is the
// code that ships. Only SpreadsheetApp entry points are absent, which is why the
// pure functions were kept free of them.
import { readFileSync } from 'node:fs';

const src = readFileSync('apps-script/trend-dashboard.gs', 'utf8');
const sandbox = {};
const fn = new Function(
  'exports',
  src + '\nexports.CONFIG=CONFIG; exports.tdNum=tdNum; exports.tdParseTimepoint=tdParseTimepoint;' +
    'exports.tdAxisLabel=tdAxisLabel; exports.tdNormaliseMetric=tdNormaliseMetric;' +
    'exports.tdParseBlocks=tdParseBlocks; exports.tdAddTotals=tdAddTotals;' +
    'exports.tdBuildPayload=tdBuildPayload; exports.tdWeightedAt=tdWeightedAt;',
);
fn(sandbox);
const {
  CONFIG, tdNum, tdParseTimepoint, tdAxisLabel, tdNormaliseMetric,
  tdParseBlocks, tdBuildPayload,
} = sandbox;

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
// The extract stringified Dates; turn A1 back into what the sheet hands over.
const grid = raw.map((r) => r.slice());
for (const i of [1, 2]) {
  const v = grid[0][i];
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) grid[0][i] = v.slice(0, 10);
}

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${g}\n         want ${w}`); }
};
const close = (name, got, want, tol = 0.005) => {
  if (got !== null && Math.abs(got - want) <= tol) { pass++; console.log(`  ok   ${name} = ${got}`); }
  else { fail++; console.log(`  FAIL ${name}  got ${got}  want ~${want}`); }
};

console.log('§9 Parse');
const blocks = tdParseBlocks(grid, CONFIG);
eq('9 block', blocks.length, 9);
eq('ten metric', blocks.map((b) => b.metric),
  ['Installs', 'Impressions', 'Clicks', 'CR', 'CPI', 'CPC', 'Pos', 'CTR', 'Spend']);
eq('8 category', blocks[0].categories.length, 8);
eq('8 moc', blocks[0].timepoints.length, 8);
eq('cot moc L..S', blocks[0].timepoints.map((t) => t.col), [11, 12, 13, 14, 15, 16, 17, 18]);
// The stop cell must be '% growth', i.e. column T = 19, not a timepoint.
eq('o dung la T (%growth)', tdParseTimepoint(grid[6][19]), null);

let filled = 0, empty = [];
for (const b of blocks) {
  for (const c of b.categories) {
    b.series[c].forEach((v, i) => {
      if (v === null) empty.push(`${b.metric}/${c}/t${i + 1}`); else filled++;
    });
  }
}
eq('575/576 o co so', [filled, filled + empty.length], [575, 576]);
eq('o thieu duy nhat', empty, ['CPI/Category/t8']);

console.log('\n§9 Sap xep moc');
const order = ['t8', 't9', 't10', 't11', 't12']
  .map((s) => tdParseTimepoint(s)).sort((a, b) => a.key - b.key).map((t) => t.raw);
eq('sort theo key', order, ['t8', 't9', 't10', 't11', 't12']);
eq('sort theo chu (phai KHAC)',
  ['t8', 't9', 't10', 't11', 't12'].slice().sort(), ['t10', 't11', 't12', 't8', 't9']);

console.log('\n§9 Nhan thang, neo t4 = 04/2026');
[['t1', '01/2026'], ['t8', '08/2026'], ['t9', '09/2026'], ['t13', '01/2027']]
  .forEach(([s, want]) => eq(s, tdAxisLabel(tdParseTimepoint(s), CONFIG), want));

console.log('\n§9 TOTAL');
const p = tdBuildPayload(grid, CONFIG);
const T = (m) => p.data[m][p.totalLabel];
eq('Installs', T('Installs'), [228, 194, 173, 170, 117, 116, 107, 100]);
// The handoff lists 1264/1245 at t2/t3. The sheet's own totals row now says
// 1262/1243, and the computed aggregate matches the sheet — so the literal in the
// handoff is a stale vintage, exactly the drift §10 warns about ("số lịch sử
// t1..t7 có bị sửa lại giữa các lần export"). Asserting agreement with the
// sheet's own totals row is the invariant that survives that drift; the literal
// would fail every time Trang revises history.
eq('Clicks t1/t4..t8 (khong doi)',
  [T('Clicks')[0], T('Clicks')[3], T('Clicks')[4], T('Clicks')[5], T('Clicks')[6], T('Clicks')[7]],
  [1543, 1281, 935, 883, 783, 799]);
close('CPI t8', T('CPI')[7], 31.54, 0.05);
close('CPI t4', T('CPI')[3], 21.49, 0.05);
eq('Pos', T('Pos').map((v) => (v === null ? null : +v.toFixed(2))),
  [2.42, 2.31, 2.20, 2.15, 2.19, 2.35, 2.93, 2.64]);
const totalPts = p.metrics.reduce((n, m) => n + T(m).filter((v) => v !== null).length, 0);
eq('72/72 diem TOTAL', totalPts, 72);

console.log('\n§9 Doi chieu dong tong co san trong sheet');
for (const b of blocks) {
  if (!b.sheetTotals) { console.log(`  (${b.metric}: sheet khong co dong tong)`); continue; }
  const mine = p.data[b.metric][p.totalLabel];
  const same = b.sheetTotals.every((v, i) => v === null || Math.abs(v - mine[i]) < 0.01);
  if (same) { pass++; console.log(`  ok   ${b.metric} khop dong tong sheet`); }
  else {
    fail++;
    console.log(`  FAIL ${b.metric}\n         sheet ${JSON.stringify(b.sheetTotals.map((v)=>v===null?null:+v.toFixed(2)))}\n         tinh  ${JSON.stringify(mine.map((v)=>v===null?null:+v.toFixed(2)))}`);
  }
}

console.log('\n§9 tdNum');
[['43%', 0.43], ['#DIV/0!', null], ['$1,234.5', 1234.5], ['', null], ['1,543', 1543]]
  .forEach(([i, w]) => eq(`tdNum(${JSON.stringify(i)})`, tdNum(i), w));

console.log('\n§2.2 Chuan hoa ten metric');
[['INSTALLS', 'Installs'], ['Click', 'Clicks'], ['CPI', 'CPI'], ['CR', 'CR'], ['Pos', 'Pos']]
  .forEach(([i, w]) => eq(`"${i}"`, tdNormaliseMetric(i, CONFIG), w));

console.log('\n§9 Bien: metric khong khai bao -> cong thang');
{
  const g = grid.map((r) => r.slice());
  // A fabricated block, so the fallback path is exercised without touching real
  // metric names anywhere in the shipped config.
  const at = g.length;
  g.push([], [], []);
  g[at] = []; g[at][11] = 'Widgets';
  g[at + 1] = []; g[at + 1][11] = 't1'; g[at + 1][12] = 't2';
  g[at + 2] = []; g[at + 2][10] = 'Brand'; g[at + 2][11] = 2; g[at + 2][12] = 3;
  const q = tdBuildPayload(g, CONFIG);
  eq('block la, cong thang', q.data['Widgets'][q.totalLabel].slice(0, 2), [2, 3]);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
