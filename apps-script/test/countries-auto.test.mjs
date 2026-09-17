// Tab Countries_performance_auto (khối doanh thu theo nước từ BigQuery) đọc ra
// đúng kiểu PerGeoRevenueRow, kỳ lấy từ dòng 1, revenue = gross.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { parseCountriesAuto } = await load('sheets/parsers.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

const rows = [
  ['Doanh thu theo nước — 4 tháng gần nhất đã kết thúc: 01/05/2026 → 31/08/2026 (tháng 5-8/2026) · BigQuery'],
  ['Nguồn: BigQuery trueda.trueprofit …'],
  [],
  ['Rank', 'Country', 'Installs', 'First paid', 'First paid CR (%)', 'ARPPU ($)', 'Revenue (gross $)', 'Value / install ($)', 'Net revenue ($)', 'Net / install ($)'],
  ['1', 'United States', '1622', '709', '43.71', '146.94', '104181.9', '64.23', '85451.5', '52.68'],
  ['2', 'Turkey', '35', '7', '20', '132.14', '925', '26.43', '713.16', '20.38'],
  ['3', 'Vietnam', '24', '0', '0', '', '0', '0', '0', '0'],
];
const r = parseCountriesAuto(rows);
eq('kỳ từ dòng 1', r.period.startsWith('Doanh thu theo nước — 4 tháng gần nhất đã kết thúc: 01/05/2026 → 31/08/2026'), true);
eq('3 nước', r.rows.length, 3);
eq('US: installs, first paid, revenue = gross', [r.rows[0].installs, r.rows[0].firstPaid, r.rows[0].revenue], [1622, 709, 104181.9]);
eq('US: CR, ARPPU, value/install tính lại', [Math.round(r.rows[0].firstPaidCr * 10000) / 10000, Math.round(r.rows[0].arppu * 100) / 100, Math.round(r.rows[0].valuePerInstall * 100) / 100], [0.4371, 146.94, 64.23]);
eq('Turkey → Türkiye, rank giữ', [r.rows[1].country, r.rows[1].rank], ['Türkiye', 2]);
eq('0 first paid → arppu null', r.rows[2].arppu, null);
eq('thiếu tiêu đề → rỗng', parseCountriesAuto([['a'], ['b']]).rows.length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
