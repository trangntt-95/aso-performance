// Kiểm tra parseNetValuePerInstall — tab 'Net value per install' (thêm 9/2026),
// và parseBidCap sau khi 'Max bid cap' đổi header lần thứ hai.
//
// Tab này là nguồn duy nhất trong workbook trả lời "một install của KEYWORD
// này đáng bao nhiêu". Trang xác nhận: net value = doanh thu − phí Shopify,
// chưa trừ tiền quảng cáo — nên nó so trực tiếp được với trần CPI.
//
// Ba chỗ dễ sai, cả ba đều sai âm thầm:
//   1. 'Keyword (raw)' và 'Keyword (decoded)' cùng bắt đầu bằng 'keyword';
//      'Net value ($)' và 'Net / install ($)' cùng bắt đầu bằng 'net'.
//   2. Header 'NPI\n(Max CPI)' có xuống dòng GIỮA ô — so chuỗi thô là trượt.
//   3. 'NPI' trần khớp luôn cả 'NPI×90%', nên trần bid đọc thành trần đã hạ 10%.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { parseNetValuePerInstall, parseBidCap } = await load('sheets/parsers.js');

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};
const near = (name, got, want, eps = 1e-6) => {
  if (typeof got === 'number' && Math.abs(got - want) <= eps) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${got}\n       want ${want}`); }
};

// Chụp từ sheet thật 10/9/2026.
const NET_VALUE_TAB = [
  ['SHOPIFY - Net Value Per Install'],
  ['Keyword x country — YTD 2026'],
  ['Complete: all 674 paid app installs'],
  [],
  ['Surface', 'Keyword (raw)', 'Keyword (decoded)', 'Cluster', 'Country', 'Installs',
    'Paying shops', 'Net value ($)', 'Net / install ($)', 'Paid CR (%)',
    'Largest shop (orders/30d)', 'Shops with 0 orders/30d'],
  ['search', 'profit', 'profit', 'Generic profit', 'United States', 69, 31,
    7918.47, 114.7604347826087, 0.4492753623188406, 13553, 18],
  ['search', 'true profit', 'true profit', 'Brand', 'United States', 47, 23,
    6644.16, 141.36510638297872, 0.48936170212765956, 8240, 12],
  ['search_ad', 'trueprofit', 'trueprofit', 'Brand', 'Australia', 0, 0, 0, '', '', '', ''],
  ['search', '', '', '', '', 0, 0, 0, '', '', '', ''],
];

console.log('Tab Net value per install');
{
  const r = parseNetValuePerInstall(NET_VALUE_TAB);
  eq('bỏ dòng không có keyword', r.rows.length, 3);
  eq('lấy được ghi chú phạm vi', r.scope, 'Keyword x country — YTD 2026');
  const a = r.rows[0];
  eq('surface', a.surface, 'search');
  // Đây là chỗ dễ sai nhất: raw phải thắng decoded, net value phải thắng net/install.
  eq('keyword lấy từ cột raw', a.keyword, 'profit');
  eq('cluster / nước', [a.cluster, a.country], ['Generic profit', 'United States']);
  eq('installs / paying shops', [a.installs, a.payingShops], [69, 31]);
  near('net value', a.netValue, 7918.47);
  near('net / install đọc từ sheet', a.netPerInstall, 114.7604347826087);
  near('paid CR', a.paidCrPct, 0.4492753623188406);
  eq('cột tập trung: shop lớn nhất + shop 0 đơn', [a.largestShopOrders, a.shopsZeroOrders], [13553, 18]);
  eq('surface paid đọc đúng', r.rows[2].surface, 'search_ad');
}

console.log('\nKhông bịa số khi không có install');
{
  const r = parseNetValuePerInstall(NET_VALUE_TAB);
  // Dòng Australia: 0 install, sheet để trống net/install → phải là null, chứ
  // chia cho 0 sẽ ra Infinity và trôi thẳng vào bảng bid.
  eq('0 install ⇒ net/install null', r.rows[2].netPerInstall, null);
  eq('ô trống ⇒ null chứ không phải 0', r.rows[2].paidCrPct, null);
}

console.log('\nTự tính net/install khi sheet không đưa');
{
  const rows = [
    ['Surface', 'Keyword (raw)', 'Country', 'Installs', 'Net value ($)'],
    ['search', 'kw', 'United States', 4, 200],
  ];
  const r = parseNetValuePerInstall(rows);
  near('200 ÷ 4', r.rows[0].netPerInstall, 50);
}

console.log('\nTab rỗng / sai');
{
  eq('rỗng', parseNetValuePerInstall([]).rows, []);
  eq('không có header khớp',
    parseNetValuePerInstall([['a', 'b'], ['1', '2']]).rows, []);
}

// ── 'Max bid cap' bản 2 ──
const BID_CAP_V2 = [
  ['TRUEPROFIT — MAX BID CAP', '', '', '', 'Bid=min(NPI×90%×CR, tier ceil)'],
  ['Cat#', 'Ctry#', 'Country', 'Tier', 'Category', 'Keyword Cluster', 'Example keywords',
    'NPI\n(Max CPI)', 'NPI×90%', 'Tier Ceil', 'CR used', 'Bid Rec ⭐', '⚠️'],
  ['c2', 'c4', 'Australia', 'Tier 1 Premium', 'Brand', 'B1. Brand chính xác',
    'true profit, trueprofit', '$86', '$77.0', '$100', '70%', '$53.90', '⚠️'],
  ['c4', 'c4', 'Australia', 'Tier 1 Premium', 'Profit', 'P1. P&L / lãi lỗ',
    'profit and loss', '$104', '$93.3', '$100', '33%', '$31.07', ''],
];

console.log('\nMax bid cap bản 2 — header NPI, có xuống dòng giữa ô');
{
  const r = parseBidCap(BID_CAP_V2);
  eq('đọc đủ dòng', r.length, 2);
  const a = r[0];
  eq('nước / tier / category', [a.country, a.tier, a.category], ['Australia', 'Tier 1 Premium', 'Brand']);
  // 'NPI\n(Max CPI)' có xuống dòng; và 'npi' trần cũng khớp 'NPI×90%'.
  eq('NPI đọc từ cột Max CPI, không phải NPI×90%', a.netValue, 86);
  eq('NPI×90%', a.capAt90, 77);
  eq('tier ceiling', a.tierCeiling, 100);
  eq('CR used', a.crUsedPct, 70);
  eq('bid rec', a.bidRecommended, 53.9);
  eq('cảnh báo ⚠️', a.warning, '⚠️');
  eq('không cảnh báo thì rỗng', r[1].warning, '');
  eq('bản 2 không còn cột kỳ ⇒ null', [a.netValuePrev, a.netValueCurr], [null, null]);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
