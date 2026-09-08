// Does lib/market/paidCategoryTrend.ts behave the same as Trang's own
// Dashboard.html + Code.gs v4?
//
// The point of this file is parity, not coverage. The Next.js screen and the
// Apps Script dialog are two front ends over one sheet, and the moment they
// disagree on a factor, a legend string or a TOTAL value, one of them is lying.
// Both implementations are run over the same fixture and compared.
//
// Run from the repo root:
//   node apps-script/test/paid-category-trend.test.mjs \
//        apps-script/test/fixture-by-categories-2026-08.json
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const fixture = process.argv[2] ?? 'apps-script/test/fixture-by-categories-2026-08.json';

// ── Compile the two pure modules and load them ──
// Built through tsconfig.build.json rather than a bare `tsc` call, because the
// modules import through the project's `@/` alias and a standalone invocation
// cannot resolve it.
execFileSync('npx', ['tsc', '-p', 'apps-script/test/tsconfig.build.json'],
  { stdio: 'pipe', shell: true });
const load = (rel) =>
  import(pathToFileURL(join(process.cwd(), 'apps-script/test/.build', rel)).href);
const trend = await load('market/paidCategoryTrend.js');
const boardMod = await load('sheets/paidCategoryBoard.js');

// ── The reference implementation: Trang's Dashboard.html logic ──
// Transcribed from the file she supplied, so the comparison is against her code
// rather than against a paraphrase of it.
const ppOf = (m, cfg) => (cfg[m].f === 'pct' ? 100 : 1);
const REF_CFG = {
  Installs: { g: 1, ax: 'L', k: 10, f: 'n' },
  Clicks: { g: 1, ax: 'L', k: 1, f: 'n' },
  Impressions: { g: 1, ax: 'L', k: 0.01, f: 'n' },
  Spend: { g: 1, ax: 'L', k: 1, f: 'money' },
  CPI: { g: 2, ax: 'R', k: 10, f: 'money' },
  CPC: { g: 2, ax: 'R', k: 100, f: 'money' },
  CR: { g: 2, ax: 'R', k: 1000, f: 'pct' },
  CTR: { g: 2, ax: 'R', k: 10000, f: 'pct' },
  Pos: { g: 2, ax: 'R', k: 100, f: 'n' },
};
const BAND = 150;

function refFmt(v, f) {
  if (v === null || v === undefined) return '—';
  if (f === 'pct') return Math.round(v * 1000) / 10 + '%';
  const a = Math.abs(v);
  const s = a >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : a >= 10 ? v.toFixed(1) : v.toFixed(2);
  return (f === 'money' ? '$' : '') + s;
}
const trim = (x) => Math.round(x * 1000) / 1000;
function refLegLabel(m, k) {
  const c = REF_CFG[m];
  if (k === undefined || k === 1) return m;
  const kd = k / ppOf(m, REF_CFG);
  const txt = Math.abs(kd - 1) < 1e-9 ? '' : (kd > 1 ? ' ×' + trim(kd) : ' ÷' + trim(1 / kd));
  return m + (c.f === 'pct' ? ' (%)' : '') + txt;
}
function refMedian(a) {
  const s = a.slice().sort((x, y) => x - y);
  const n = s.length;
  if (!n) return null;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function refScaleFor(mets, series, autoK) {
  const out = {};
  if (!mets.length) return out;
  if (mets.length === 1) { out[mets[0]] = 1; return out; }
  if (!autoK) { mets.forEach((m) => { out[m] = REF_CFG[m].k; }); return out; }
  const meds = {}, pts = {};
  mets.forEach((m) => {
    const pp = ppOf(m, REF_CFG);
    const v = series(m).filter((x) => x !== null && x > 0);
    pts[m] = v;
    const mv = v.map((x) => x * pp);
    meds[m] = mv.length ? refMedian(mv) : null;
  });
  const cands = [];
  for (let e = 0; e <= 4.5; e += 0.05) {
    const target = Math.pow(10, e), ks = {};
    mets.forEach((m) => {
      const pp = ppOf(m, REF_CFG);
      ks[m] = meds[m] ? pp * Math.pow(10, Math.round(Math.log(target / meds[m]) / Math.LN10))
        : REF_CFG[m].k;
    });
    let lo = Infinity, hi = -Infinity, sum = 0, n = 0;
    mets.forEach((m) => {
      pts[m].forEach((v) => {
        const x = v * ks[m];
        if (x <= 0) return;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
        sum += Math.log(x) / Math.LN10; n++;
      });
    });
    if (!n || lo === Infinity) continue;
    const gm = Math.pow(10, sum / n);
    cands.push({ r: hi / lo, pen: Math.abs(Math.log(gm / BAND) / Math.LN10), ks });
  }
  if (!cands.length) { mets.forEach((m) => { out[m] = REF_CFG[m].k; }); return out; }
  let minR = Infinity;
  cands.forEach((c) => { if (c.r < minR) minR = c.r; });
  let pick = null;
  cands.forEach((c) => {
    if (c.r > minR * 1.02) return;
    if (!pick || c.pen < pick.pen) pick = c;
  });
  return pick.ks;
}

// ── Build the cube from the fixture ──
const raw = JSON.parse(readFileSync(fixture, 'utf8'));
const grid = raw.map((r) => r.slice());
for (const i of [1, 2]) {
  const v = grid[0][i];
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) grid[0][i] = v.slice(0, 10);
}
const board = boardMod.parsePaidCategoryBoard(grid);
const cube = trend.buildTrendCube(board);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${g}\n         want ${w}`); }
};

console.log('Cube tu fixture');
eq('9 metric', cube.metrics.length, 9);
eq('periods = thang', cube.periods, ['T1/26','T2/26','T3/26','T4/26','T5/26','T6/26','T7/26','T8/26']);
eq('TOTAL dung dau', cube.categories[0], 'TOTAL');
eq('9 category (TOTAL + 8)', cube.categories.length, 9);

console.log('\nTOTAL — doi chieu voi dong tong co san trong sheet');
for (const tier of board.series) {
  if (!tier.totals.length) continue;
  const mine = cube.periods.map((_, i) => cube.at(tier.metric, 'TOTAL', i));
  const same = tier.totals.every((v, i) => v === null || Math.abs(v - mine[i]) < 0.01);
  if (same) { pass++; console.log(`  ok   ${tier.metric} khop dong tong sheet`); }
  else { fail++; console.log(`  FAIL ${tier.metric}\n         sheet ${JSON.stringify(tier.totals)}\n         cube  ${JSON.stringify(mine)}`); }
}
{
  const cpi = cube.periods.map((_, i) => cube.at('CPI', 'TOTAL', i));
  const t8 = cpi[cpi.length - 1];
  if (t8 !== null && Math.abs(t8 - 31.54) < 0.05) { pass++; console.log(`  ok   CPI TOTAL t8 = ${t8.toFixed(2)}`); }
  else { fail++; console.log(`  FAIL CPI TOTAL t8 = ${t8}`); }
  const pos = cube.periods.map((_, i) => cube.at('Pos', 'TOTAL', i));
  eq('Pos TOTAL', pos.map((v) => (v === null ? null : +v.toFixed(2))),
    [2.42, 2.31, 2.20, 2.15, 2.19, 2.35, 2.93, 2.64]);
}

console.log('\nParity: fmtValue vs Dashboard.html fmt()');
const probes = [[0.1252,'pct'],[0.0043,'pct'],[31.54,'money'],[3.9474,'money'],
  [185123,'n'],[2.64,'n'],[0,'n'],[999.5,'money'],[1000,'n'],[null,'money']];
for (const [v, f] of probes) {
  eq(`fmt(${v}, ${f})`, trend.fmtValue(v, f), refFmt(v, f));
}

console.log('\nParity: legendLabel vs legLabel()');
for (const m of Object.keys(REF_CFG)) {
  for (const k of [undefined, 1, 10, 100, 1000, 10000, 0.01, 0.1]) {
    eq(`legend(${m}, ${k})`, trend.legendLabel(m, k), refLegLabel(m, k));
  }
}

console.log('\nParity: pickFactors vs scaleFor() — moi category, moi nhom, ca 2 che do');
let combos = 0;
for (const cat of cube.categories) {
  for (const gid of ['1', '2', 'total']) {
    const mets = trend.metricsOfGroup(cube.metrics, gid);
    const series = (m) => cube.periods.map((_, i) => cube.at(m, cat, i));
    const sets = gid === 'total'
      ? [mets.filter((m) => REF_CFG[m].ax !== 'R'), mets.filter((m) => REF_CFG[m].ax === 'R')]
      : [mets];
    for (const auto of [true, false]) {
      for (const set of sets) {
        const mine = trend.pickFactors(set, series, auto);
        const theirs = refScaleFor(set, series, auto);
        combos++;
        const g = JSON.stringify(mine), w = JSON.stringify(theirs);
        if (g !== w) {
          fail++;
          console.log(`  FAIL ${cat}/${gid}/auto=${auto}\n         got  ${g}\n         want ${w}`);
        }
      }
    }
  }
}
pass++;
console.log(`  ok   ${combos} to hop he so khop tuyet doi`);

console.log('\nlayoutEndLabels');
eq('[200,203,206,209]', trend.layoutEndLabels([200,203,206,209], 0, 1000), [200,215,230,245]);
eq('day ca cum len', trend.layoutEndLabels([370,372,375,378,379], 0, 380), [320,335,350,365,380]);
eq('giu nguyen thu tu dau vao',
  trend.layoutEndLabels([209,200,206,203], 0, 1000), [245,200,230,215]);
{
  const r = trend.layoutEndLabels([25,26,27], 20, 60);
  eq('trong vung top20 bottom60', r.every((y) => y >= 20 && y <= 60), true);
}

console.log('\nNhom + mac dinh hien');
eq('groups', trend.groupsPresent(cube.metrics).map((g) => g.id), ['1', '2', 'total']);
eq('nhan nhom 1', trend.groupsPresent(cube.metrics)[0].label, 'Khối lượng — 4 metric');
eq('DEFAULT_ON.1', trend.DEFAULT_ON['1'], ['Installs', 'Clicks']);
eq('DEFAULT_ON.2', trend.DEFAULT_ON['2'], ['CPI', 'CR', 'CPC']);
eq('DEFAULT_ON.total', trend.DEFAULT_ON.total, ['Installs', 'CPI']);
eq('metric nhom 2', trend.metricsOfGroup(cube.metrics, '2'), ['CR','CPI','CPC','Pos','CTR']);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
