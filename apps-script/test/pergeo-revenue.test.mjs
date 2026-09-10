// Kiểm tra parsePerGeoRevenue trên CẢ HAI cách sắp của tab
// 'Countries performance' (trước là PerGeo_CPI_Cap).
//
// Vì sao có file này: parser tìm header bằng điều kiện "cột >= 4", đặt ra hồi
// còn khối cấu hình CPI cap ở A–E. Tháng 9/2026 tab được sắp lại, 'Country' về
// cột C — parser trả 0 dòng, và mọi trần CPI cùng trọng số doanh thu biến mất
// khỏi dashboard mà không có một lỗi nào. Layout của tab này đã đổi vài lần,
// nên test giữ lại cả hai bản để lần sắp lại sau không âm thầm làm hỏng tiếp.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { parsePerGeoRevenue } = await load('sheets/parsers.js');

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

/** { C: 'Country' } → mảng ô với 'Country' ở đúng cột C. */
const at = (cells) => {
  const row = [];
  for (const [col, v] of Object.entries(cells)) row[col.charCodeAt(0) - 65] = v;
  for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
  return row;
};

// ── Bản 9/2026: khối doanh thu ở B–I, khối tier ở O..Z ──
const LAYOUT_2026_09 = [
  at({ D: 'RAW DATA: (update qua quý)', I: 2127.1 }),
  at({ C: 'tháng 5-8' }),
  at({
    C: 'Country', D: 'installed', E: 'first paid', F: 'first paid CR',
    G: 'ARPPU', H: 'Revenue', I: 'giá trị 1 install',
    M: 'Excluded', O: 'Tier 1 - Premium',
  }),
  at({ B: 1, C: 'United States', D: 1604, E: 612, F: 0.3815, G: 141.08, H: 86343.69, I: 53.83 }),
  at({ B: 2, C: 'Spain', D: 929, E: 308, F: 0.3315, G: 66.4, H: 20451.28, I: 22.01 }),
  at({ B: 3, C: 'Australia', D: 204, E: 82, F: 0.4019, G: 166.23, H: 13631.32, I: 66.82 }),
];

// ── Bản cũ: khối cấu hình CPI cap ở A–E, khối doanh thu ở I–P ──
const LAYOUT_OLD = [
  at({ I: 'RAW DATA' }),
  at({ I: 'tháng 2-4' }),
  at({
    A: 'Country', B: 'CPI Cap ($)', C: 'Note',
    I: 'Country', J: 'installed', K: 'first paid', L: 'first paid CR',
    M: 'ARPPU', N: 'Revenue', O: 'giá trị 1 install',
  }),
  at({ A: 'India', B: 5, H: 1, I: 'United States', J: 7022, K: 2757, L: 0.39, M: 374.85, N: 1033485.24, O: 147.17 }),
  at({ A: 'Brazil', B: 4, H: 2, I: 'United Kingdom', J: 1574, K: 571, L: 0.36, M: 297.6, N: 169934.39, O: 107.96 }),
];

console.log('Bản sắp 9/2026 — Country ở cột C');
{
  const r = parsePerGeoRevenue(LAYOUT_2026_09);
  eq('đọc đủ dòng', r.rows.length, 3);
  eq('kỳ lấy từ ô phía trên cột Country', r.period, 'tháng 5-8');
  eq('nước đầu', r.rows[0].country, 'United States');
  eq('rank nằm ở cột ngay bên trái Country', r.rows[0].rank, 1);
  eq('installs', r.rows[0].installs, 1604);
  eq('first paid tách khỏi first paid CR', [r.rows[0].firstPaid, r.rows[0].firstPaidCr], [612, 0.3815]);
  eq('arppu', r.rows[0].arppu, 141.08);
  eq('revenue', r.rows[0].revenue, 86343.69);
  eq('value/install', r.rows[0].valuePerInstall, 53.83);
}

console.log('\nBản cũ — Country ở cả cột A và cột I, phải chọn đúng khối doanh thu');
{
  const r = parsePerGeoRevenue(LAYOUT_OLD);
  eq('đọc đủ dòng', r.rows.length, 2);
  // Cột A cũng là 'Country' nhưng khối đó không có revenue/arppu bên phải —
  // chọn theo nội dung nên vẫn ra đúng khối bên phải.
  eq('không nhặt nhầm khối cấu hình bên trái', r.rows[0].country, 'United States');
  eq('revenue của khối phải', r.rows[0].revenue, 1033485.24);
  eq('kỳ', r.period, 'tháng 2-4');
}

console.log('\nKhông có khối doanh thu');
{
  eq('tab rỗng', parsePerGeoRevenue([]).rows, []);
  eq('không có header nào khớp',
    parsePerGeoRevenue([at({ A: 'Country', B: 'Note' }), at({ A: 'India', B: 'x' })]).rows, []);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
