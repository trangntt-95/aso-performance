// Tên nước về một cách viết khi đọc sheet, và khối Tier chỉ nhận ô là tên nước.
//
// Vì sao (17/09/2026): Countries performance / Max bid cap / Net value / khối
// Tier ghi 'Turkey', GA4 ghi 'Türkiye' → Türkiye rơi khỏi tier, NPI, value,
// trần bid mà không có lỗi. Khối Tier lại có thêm cột net value, mũi tên,
// '$30-40', 'Net value', 'paid CR thấp' → 70 ô rác được đọc thành nước.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { parseMarketTiers } = await load('sheets/parsers.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

// Layout tháng 9/2026: mỗi tier chiếm 3 cột (nước · net value · mũi tên), chỉ
// cột đầu có tiêu đề tier; hàng bid; rồi các nước. Cột 'paid CR thấp' là ghi chú.
const rows = [
  ['Tier 1 - Premium', '', '', 'Tier 2', '', ''],
  ['$30-40', 'Net value', '', '$12-20', 'Net value', ''],
  ['United States', '100', '↑', 'Turkey', '16', '↓'],
  ['Australia', '70', '', 'Portugal', '17', '↑'],
  ['Finland (vol bé)', '179', '↑', 'Italy', '20', ''],
  ['Canada', '44', '↓', 'paid CR thấp', '', ''],
];
const tiers = parseMarketTiers(rows);
eq('2 tier', tiers.map((t) => t.tier), ['Tier 1 - Premium', 'Tier 2']);
eq('Tier 1: chỉ tên nước, không số / mũi tên / Net value', tiers[0].countries.map((c) => c.country), ['United States', 'Australia', 'Finland', 'Canada']);
eq('Tier 1: note vol bé giữ lại', tiers[0].countries.find((c) => c.country === 'Finland').note, 'vol bé');
eq('Tier 2: Turkey → Türkiye, bỏ paid CR thấp', tiers[1].countries.map((c) => c.country), ['Türkiye', 'Portugal', 'Italy']);
eq('max bid từ hàng bid', [tiers[0].maxBid, tiers[1].maxBid], [40, 20]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
