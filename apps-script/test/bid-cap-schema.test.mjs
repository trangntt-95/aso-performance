// Kiểm tra parseBidCap trên bản dựng lại 9/2026 của tab 'Max bid cap'.
//
// Tab này giờ mang đủ từng thành phần của công thức ghi ở dòng tiêu đề
//   Bid = min(NetVal × 90% × CR, Tier Ceiling)
// chứ không chỉ kết quả. Quan trọng nhất là cột 'Net Val' — Trang xác nhận nó
// là (doanh thu − phí Shopify) ÷ install, tức đã trừ phí nền tảng nhưng CHƯA
// trừ tiền quảng cáo, nên nó so trực tiếp được với trần CPI.
//
// Hai chỗ dễ sai:
//   1. 'Net Val' và 'Val T4-7' cùng bắt đầu bằng 'val' sau khi lowercase —
//      tìm sai thứ tự thì trần đọc thành giá trị kỳ trước.
//   2. Ô trống phải ra null, không phải 0: 0 nghĩa là "một install ở đây không
//      đáng gì", còn trống nghĩa là "sheet chưa nói".
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { parseBidCap } = await load('sheets/parsers.js');

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

// Chụp từ sheet thật 10/9/2026.
const SHEET = [
  ['TRUEPROFIT — MAX BID CAP', '', '', '', 'Bid=min(NetVal×90%×CR, Tier Ceil)'],
  ['Tier', '#', 'Country', 'Category', 'Keyword Cluster', 'Example keywords',
    'Val T4-7', 'Val T5-8', 'Net Val', 'Cap×90%', 'Tier Ceil', 'CR used %',
    'CR source', 'Bid Rec ⭐', '⚠️ Warning'],
  ['Tier 1 Premium', 1, 'United States', 'Brand', 'B1. Brand chính xác',
    'true profit, trueprofit', '62.0', '54.0', '$58.00', '$52.20', '$100.00',
    '66.5%', 'L90 actual 70% ×0.95', '$34.71', ''],
  ['Tier 1 Premium', 1, 'United States', 'Profit', 'P2. Máy tính lợi nhuận',
    'profit calculator', '62.0', '54.0', '$58.00', '$52.20', '$100.00',
    '99.0%', 'L90 actual 48% ×2.11', '$51.68', '⚠️ BID $51.68 > $45'],
  ['Tier 2', 5, 'Brazil', 'Competitor', 'C. hyros', 'hyros',
    '', '', '', '', '$20.00', '', '', '', ''],
];

console.log('Bản dựng lại 9/2026');
{
  const r = parseBidCap(SHEET);
  eq('đọc đủ dòng', r.length, 3);
  const us = r[0];
  eq('tier / nước / category', [us.tier, us.country, us.category], ['Tier 1 Premium', 'United States', 'Brand']);
  eq('cluster', us.keywordCluster, 'B1. Brand chính xác');
  // Đây là chỗ dễ sai nhất: 'Net Val' phải thắng 'Val T4-7'.
  eq('net value đọc từ cột Net Val, không phải Val T4-7', us.netValue, 58);
  eq('giá trị kỳ trước', us.netValuePrev, 62);
  eq('giá trị kỳ này', us.netValueCurr, 54);
  eq('trần đã hạ 10%', us.capAt90, 52.2);
  eq('tier ceiling', us.tierCeiling, 100);
  eq('CR dùng trong công thức', us.crUsedPct, 66.5);
  eq('nguồn CR', us.crSource, 'L90 actual 70% ×0.95');
  eq('bid rec', us.bidRecommended, 34.71);
  eq('không có cảnh báo thì rỗng', us.warning, '');
}

console.log('\nCảnh báo của sheet được giữ nguyên');
{
  const r = parseBidCap(SHEET);
  eq('đọc được dòng cảnh báo', r[1].warning, '⚠️ BID $51.68 > $45');
}

console.log('\nÔ trống ra null, không phải 0');
{
  const r = parseBidCap(SHEET);
  const br = r[2];
  eq('net value trống ⇒ null', br.netValue, null);
  eq('cap×90% trống ⇒ null', br.capAt90, null);
  eq('CR trống ⇒ null', br.crUsedPct, null);
  // tierCeiling vẫn là number (field cũ), 20 là số thật.
  eq('tier ceiling vẫn đọc được', br.tierCeiling, 20);
  eq('bid rec trống ⇒ 0, và phải guard bằng > 0', br.bidRecommended, 0);
}

console.log('\nCột của bản cũ đã biến mất — về 0, không nổ');
{
  const r = parseBidCap(SHEET);
  eq('cpiCap không còn trong sheet', r[0].cpiCap, 0);
  eq('instL90 không còn', r[0].instL90, 0);
  eq('countryCode không còn', r[0].countryCode, '');
}

console.log('\nBản cũ vẫn phải parse được');
{
  const OLD = [
    ['MAX BID CAP'],
    ['Tier', 'Country', 'Code', 'Category', 'Keyword Cluster', 'Example keywords',
      'Inst L90', 'Clicks/mo', 'Inst/mo', 'CR %', 'CPI cap', 'Tier ceil.', 'Bid Rec ⭐', 'Action'],
    ['Tier 1', 'United States', 'US', 'Brand', 'B1', 'true profit',
      '120', '300', '40', '35.2%', '$68.24', '$100.00', '$34.71', 'Giữ'],
  ];
  const r = parseBidCap(OLD);
  eq('vẫn ra dòng', r.length, 1);
  eq('cpi cap của bản cũ', r[0].cpiCap, 68.24);
  eq('CR % của bản cũ', r[0].crActual, 35.2);
  eq('action của bản cũ', r[0].actionRecommended, 'Giữ');
  eq('bản cũ không có Net Val ⇒ null', r[0].netValue, null);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
