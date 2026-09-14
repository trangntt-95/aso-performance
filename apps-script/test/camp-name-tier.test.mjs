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

// Khoảng trắng quanh dấu gạch không phải danh tính
const r2 = buildCampNameResolver(['TP_Languages_German_Broad- rất ít imp', 'TP - Brandname - Exact - US']);
eq('dash dính chữ vs có space → cùng camp', r2.resolve('TP_Languages_German_Broad - rất ít imp'), 'TP_Languages_German_Broad- rất ít imp');
eq('nhiều space quanh dash → cùng camp', r2.resolve('TP  -  Brandname -Exact-  US (CPI 9)'), 'TP - Brandname - Exact - US');

// Camp_Links giữ ghi chú, export giữ tên trần → ghép ngược (duy nhất + đuôi giống ghi chú)
const r3 = buildCampNameResolver([
  '! TP - Cateogry - Analytics App - Broad 02 - no ins',
  'TP - Feature - Dashboard (CR thấp)',
  '[02.03] Test Broad',
  'TP - Profit - Exact 01 - Tier 2 - HU',
  'TP - Profit - Exact 01 - Tier 2 - NO',
  'TP - Others - Low bid 09 - test till Oct',
  'TP - Others - Low bid 09 - watch',
]);
eq('dấu ! đầu tên bị bỏ', r3.resolve('TP - Cateogry - Analytics App - Broad 02 - no ins'), 'TP - Cateogry - Analytics App - Broad 02 - no ins');
eq('ghép ngược: tên trần → tên có ghi chú "- no ins"', r3.resolve('TP - Cateogry - Analytics App - Broad 02'), 'TP - Cateogry - Analytics App - Broad 02 - no ins');
eq('ghép ngược: tên trần → tên có "(CR thấp)"', r3.resolve('TP - Feature - Dashboard'), 'TP - Feature - Dashboard (CR thấp)');
eq('ghép ngược: đuôi geo " - HU" KHÔNG tính', r3.resolve('TP - Profit - Exact 01 - Tier 2'), null);
eq('ghép ngược: hai ứng viên → null', r3.resolve('TP - Others - Low bid 09'), null);
eq('tên raw "(CPI 5) maintain" ghép vào "[02.03] Test Broad"', r3.resolve('[02.03] Test Broad (CPI 5) maintain'), '[02.03] Test Broad');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
