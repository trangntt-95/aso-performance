// Camp đổi tier trong tên ("Tier 1 - ES" → "Tier 2 - ES") nhưng Camp_Links giữ
// tên cũ: cùng một campaign id mà mất URL. Resolver phải ghép được khi bỏ qua
// số tier — và CHỈ khi kết quả là duy nhất.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildCampNameResolver, tierAgnostic } = await load('sheets/campName.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

eq('tierAgnostic: Tier 1 Premium', tierAgnostic('tp - profit - exact 01 - tier 1 premium - fi'), 'tp - profit - exact 01 - tier# - fi');
eq('tierAgnostic: Tier 1,5', tierAgnostic('tp - brandname - exact - tier 1,5 - italy'), 'tp - brandname - exact - tier# - italy');
eq('tierAgnostic: no tier → unchanged', tierAgnostic('tp - cpm - broad 06'), 'tp - cpm - broad 06');

const known = [
  'TP - Profit - Exact 01 - Tier 1 - ES',
  'TP - Profit - Exact 01 - Tier 1 - DE',
  'TP - Profit - Exact 01 - Tier 1 Premium - FI',
  'TP - Brandname - Exact - Tier 1 - HK',
  // hai anh em chỉ khác tier → không được đoán
  'TP - Feature - Dashboard - Tier 1 - US',
  'TP - Feature - Dashboard - Tier 3 - US',
  'TP - CPM - Broad 06 (-IN)',
];
const r = buildCampNameResolver(known);

eq('exact vẫn thắng', r.resolve('TP - Profit - Exact 01 - Tier 1 - ES'), 'TP - Profit - Exact 01 - Tier 1 - ES');
eq('đổi tier 1→2', r.resolve('TP - Profit - Exact 01 - Tier 2 - ES'), 'TP - Profit - Exact 01 - Tier 1 - ES');
eq('đổi tier + tag CPI', r.resolve('TP - Profit - Exact 01 - Tier 2 - DE (CPI 29)'), 'TP - Profit - Exact 01 - Tier 1 - DE');
eq('Premium → thường', r.resolve('TP - Profit - Exact 01 - Tier 2 - FI'), 'TP - Profit - Exact 01 - Tier 1 Premium - FI');
eq('thường → Premium', r.resolve('TP - Brandname - Exact - Tier 1 Premium - HK'), 'TP - Brandname - Exact - Tier 1 - HK');
eq('đổi tier + ghi chú tự do', r.resolve('TP - Profit - Exact 01 - Tier 3 - ES - focus'), 'TP - Profit - Exact 01 - Tier 1 - ES');
eq('hai ứng viên → null', r.resolve('TP - Feature - Dashboard - Tier 2 - US'), null);
eq('khác nước → null', r.resolve('TP - Profit - Exact 01 - Tier 2 - SW'), null);
eq('không tier, không biết → null', r.resolve('TP - CPM - Broad 07 (-IN)'), null);
eq('không tier, ghi chú → vẫn ghép lớp 2', r.resolve('TP - CPM - Broad 06 (-IN) - CPI 5, good'), 'TP - CPM - Broad 06 (-IN)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
