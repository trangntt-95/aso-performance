// Kiểm tra parseSearchTermUnbidded — tab 'Search_Term_Unbidded'.
//
// Grain của tab này khác mọi nguồn khác của Paid Coverage: nó là CÂU NGƯỜI TA
// GÕ mà broad match bắt được, không phải keyword đang bid. Cột 'Keyword' trong
// tab là keyword đã bắt câu đó — đọc nhầm cột này thì danh sách "chưa bid" sẽ
// toàn keyword đang bid.
//
// Ngày là serial Excel; đọc sai thì khoảng báo cáo hiện thành 1970.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { parseSearchTermUnbidded } = await load('sheets/parsers.js');

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

// Chụp từ sheet thật 10/9/2026.
const TAB = [
  ['App Name', 'Ad Name', 'Start Date', 'End Date', 'Time Zone', 'Currency',
    'Search Term', 'Keyword', 'Match Type', 'Bid', 'Impressions', 'Clicks',
    'Click Through Rate', 'Installs', 'Install Rate', 'Cost Per Click',
    'Cost Per Install', 'Spend', 'Average Position', 'Visibility', 'Customers',
    'Revenue', 'Return On Spend', 'Cost Per Customer', 'Conversion Rate', 'Bid Status'],
  ['TP: True Profit Analytics', 'TP - Competitor - 05', 45812, 46177, 'UTC', 'USD',
    'ltv whale', 'whale', 'broad', 4.77, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '⚠️ Chưa bid'],
  ['TP: True Profit Analytics', 'TP - Competitor - 05', 45812, 46177, 'UTC', 'USD',
    'tripple apple', 'tripple', 'broad', 3.98, 2, 1, 0.5, 1, 0.5, 1.2, 2.4, 2.4, 1, 0.66, 1, 240, 100, 2.4, 1, '⚠️ Chưa bid'],
  ['TP: True Profit Analytics', 'TP - Brand', 45812, 46177, 'UTC', 'USD',
    '', 'x', 'exact', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ''],
];

console.log('Đọc tab');
{
  const r = parseSearchTermUnbidded(TAB);
  eq('bỏ dòng không có search term', r.rows.length, 2);
  const a = r.rows[0];
  // Chỗ dễ sai nhất: 'Search Term' là câu người gõ, 'Keyword' là keyword đã bắt nó.
  eq('search term là câu người gõ', a.searchTerm, 'ltv whale');
  eq('keyword đã bắt được câu đó', a.matchedKeyword, 'whale');
  eq('match type', a.matchType, 'broad');
  eq('camp lấy từ Ad Name', a.camp, 'TP - Competitor - 05');
  eq('bid của keyword bắt được nó', a.bid, 4.77);
  eq('trạng thái từ sheet', a.bidStatus, '⚠️ Chưa bid');

  const b = r.rows[1];
  eq('số liệu', [b.impressions, b.clicks, b.installs], [2, 1, 1]);
  eq('spend / revenue / roas', [b.spend, b.revenue, b.roas], [2.4, 240, 100]);
  eq('customers', b.customers, 1);
  eq('vị trí trung bình', b.position, 1);
}

console.log('\nKhoảng ngày đọc từ serial Excel');
{
  const r = parseSearchTermUnbidded(TAB);
  // Tính từ epoch 1899-12-30 của Excel; hai serial này lấy từ sheet thật.
  eq('from', r.from, '2025-06-04');
  eq('to', r.to, '2026-06-04');
}

console.log('\nTab rỗng / sai');
{
  eq('rỗng', parseSearchTermUnbidded([]).rows, []);
  eq('không có header khớp', parseSearchTermUnbidded([['a', 'b'], ['1', '2']]).rows, []);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
