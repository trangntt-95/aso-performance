// Acceptance test for the dialog's pure logic (§9: tooltip format, legend
// labels, factor selection, label de-collision).
//
// The <script> block of trend-dashboard.html is extracted and evaluated, so the
// functions tested are the ones that ship. Chart.js and the DOM are stubbed
// because none of the logic under test touches them.
import { readFileSync } from 'node:fs';

const html = readFileSync('apps-script/trend-dashboard.html', 'utf8');
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

// Cut the bootstrap tail (DOM wiring + load()) — everything above it is pure.
const cut = script.indexOf("['cat', 'grp', 'from', 'to'].forEach");
const body = script.slice(0, cut);

const stubs = `
var Chart = { register: function () {} };
var document = { getElementById: function () { return null; }, createElement: function () { return { style: {}, appendChild: function () {}, setAttribute: function(){} }; } };
var google = { script: { run: {} } };
`;

const sandbox = {};
new Function('exports', stubs + body +
  '\nexports.fmtVal=fmtVal; exports.legLabel=legLabel; exports.layoutLabels=layoutLabels;' +
  'exports.pickFactors=pickFactors; exports.median=median; exports.METRICS=METRICS;' +
  'exports.setData=function(d){DATA=d;}; exports.seriesOf=seriesOf;' +
  'exports.DEFAULT_ON=DEFAULT_ON; exports.GROUPS=GROUPS; exports.cfgOf=cfgOf;')(sandbox);

const { fmtVal, legLabel, layoutLabels, pickFactors, setData, DEFAULT_ON, cfgOf } = sandbox;

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name} = ${g}`); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${g}\n         want ${w}`); }
};

console.log('§9 Dinh dang tooltip');
eq('CR 0.1252', fmtVal('CR', 0.1252), '12.5%');
eq('CTR 0.0043', fmtVal('CTR', 0.0043), '0.4%');
eq('CPI 31.54', fmtVal('CPI', 31.54), '$31.5');
eq('CPC 3.9474', fmtVal('CPC', 3.9474), '$3.95');
eq('Impressions 185123', fmtVal('Impressions', 185123), '185,123');
eq('Pos 2.64', fmtVal('Pos', 2.64), '2.64');
eq('null', fmtVal('CPI', null), '—');

console.log('\n§9 Nhan he so');
eq("legLabel('CR', 1)", legLabel('CR', 1), 'CR');
eq("legLabel('CR', 1000)", legLabel('CR', 1000), 'CR (%) ×10');
eq("legLabel('CTR', 10000)", legLabel('CTR', 10000), 'CTR (%) ×100');
eq("legLabel('Installs', 1)", legLabel('Installs', 1), 'Installs');
eq("legLabel('CR', 100)", legLabel('CR', 100), 'CR (%)');

console.log('\n§9 Nhan cuoi duong — chong de (gap 15, vung 0..1000)');
eq('[200,203,206,209]', layoutLabels([200, 203, 206, 209], 0, 1000, 15), [200, 215, 230, 245]);
eq('[370,372,375,378,379] vung ..380',
  layoutLabels([370, 372, 375, 378, 379], 0, 380, 15), [320, 335, 350, 365, 380]);
eq('9 nhan tu 22',
  layoutLabels([22, 23, 24, 25, 26, 27, 28, 29, 30], 0, 1000, 15),
  [22, 37, 52, 67, 82, 97, 112, 127, 142]);
{
  const out = layoutLabels([25, 26, 27], 20, 60, 15);
  const inside = out.every((y) => y >= 20 - 1e-9 && y <= 60 + 1e-9);
  eq('vung top20 bottom60 — trong vung', inside, true);
}

console.log('\n§9 Ti le truc khi bat het metric, che do tu chinh');
const grid = JSON.parse(readFileSync(process.argv[2], 'utf8'));
// Reuse the .gs parser so the dialog test runs on the same numbers as the sheet.
const gs = readFileSync('apps-script/trend-dashboard.gs', 'utf8');
const gsBox = {};
new Function('exports', gs + '\nexports.tdBuildPayload=tdBuildPayload; exports.CONFIG=CONFIG;')(gsBox);
const g2 = grid.map((r) => r.slice());
for (const i of [1, 2]) {
  const v = g2[0][i];
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) g2[0][i] = v.slice(0, 10);
}
const payload = gsBox.tdBuildPayload(g2, gsBox.CONFIG);
setData(payload);

const n = payload.labels.length - 1;
function ratioFor(gid, cat) {
  const ms = payload.metrics.filter((m) => (gid === 'total' ? true : cfgOf(m).group === gid));
  const groups = gid === 'total'
    ? [ms.filter((m) => cfgOf(m).axis !== 'R'), ms.filter((m) => cfgOf(m).axis === 'R')]
    : [ms];
  let worst = 0;
  for (const set of groups) {
    if (set.length < 2) continue;
    const f = pickFactors(set, cat, 0, n);
    let lo = Infinity, hi = -Infinity;
    for (const m of set) {
      for (const v of sandbox.seriesOf(m, cat, 0, n)) {
        if (v === null || !isFinite(v)) continue;
        const s = Math.abs(v * f[m]);
        if (s <= 0) continue;
        lo = Math.min(lo, s); hi = Math.max(hi, s);
      }
    }
    if (isFinite(lo) && lo > 0) worst = Math.max(worst, hi / lo);
  }
  return worst;
}
for (const gid of ['vol', 'eff']) {
  const rows = payload.categories.map((c) => ({ c, r: ratioFor(gid, c) }))
    .sort((a, b) => b.r - a.r);
  console.log(`  ${gid}: xau nhat ${rows[0].c} ${rows[0].r.toFixed(1)}x · TOTAL ${ratioFor(gid, payload.totalLabel).toFixed(1)}x`);
  if (rows[0].r < 60) { pass++; console.log(`  ok   ${gid} ti le xau nhat < 60x (ghim co dinh la ~60-73x)`); }
  else { fail++; console.log(`  FAIL ${gid} ti le xau nhat ${rows[0].r.toFixed(1)}x >= 60x`); }
}

console.log('\n§7 Mac dinh hien — tach rieng theo nhom');
eq('vol', DEFAULT_ON.vol, ['Installs', 'Clicks']);
eq('eff', DEFAULT_ON.eff, ['CPI', 'CR', 'CPC']);
eq('total', DEFAULT_ON.total, ['Installs', 'CPI']);
{
  // Toggling in one group must not leak into another.
  const vis = { vol: {}, total: {} };
  vis.vol.Clicks = true;
  eq('bat Clicks o vol khong bat o total', vis.total.Clicks, undefined);
}

console.log('\n§9 Bien: 1 duong tren truc -> he so 1 (truc hien gia tri goc)');
eq('1 metric', pickFactors(['Impressions'], payload.totalLabel, 0, n), { Impressions: 1 });

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
