// apps-script/camp-id-sync.gs — phần ghép tên Master → Campaign ID của
// Camp_Links. File .gs được nạp nguyên văn (code test = code chạy thật); chỉ
// các hàm thuần (không đụng SpreadsheetApp) được gọi.
//
// Kỳ vọng khớp đúng thứ tự lớp của lib/sheets/campName.ts, để sheet và
// dashboard gọi cùng một camp giống nhau.
import { readFileSync } from 'node:fs';

const src = readFileSync('apps-script/camp-id-sync.gs', 'utf8');
const sandbox = {};
new Function(
  'exports',
  src +
    '\nexports.buildCampIdIndex_=buildCampIdIndex_; exports.resolveCampId_=resolveCampId_;' +
    'exports.campIdNormalizeName_=campIdNormalizeName_; exports.campIdFromUrl_=campIdFromUrl_;',
)(sandbox);
const { buildCampIdIndex_, resolveCampId_, campIdNormalizeName_, campIdFromUrl_ } = sandbox;

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

// Tab Camp_Links như getValues(): 2 dòng đầu là tiêu đề/ghi chú, dòng 3 header.
const U = (id) => `https://partners.shopify.com/832504/ads/${id}`;
const LINKS = [
  ['Camp_Links', '', '', '', ''],
  ['ghi chú', '', '', '', ''],
  ['Category', 'Camp Name', 'Campaign ID', 'URL', 'Geo', 'Tên cũ (alias)'],
  ['Profit', 'TP - Profit - Exact 01 - Tier 1 - NL', '74102', U(74102), 'Hà Lan', ''],
  ['Profit', 'TP - Profit - Exact 01 - Tier 1 - ES', '37597', U(37597), 'Spain', ''],
  ['Profit', 'TP - Profit - Exact 01 - Tier 1 - DE', '', U(73929), 'Đức', ''], // không có ID → lấy từ URL
  ['Brand', 'TP - Brandname - Exact - US', '44442', U(44442), 'US', 'TP - Brandname - Exact - US - old suffix | TP - Brandname - Exact - USA'],
  ['Feature', 'TP - Feature - Dashboard - Tier 1 - US', '1', U(1), '', ''],
  ['Feature', 'TP - Feature - Dashboard - Tier 3 - US', '2', U(2), '', ''],
  ['Category', '! TP - Cateogry - Analytics App - Broad 02 - no ins', '61821', U(61821), '', ''],
  ['Others', 'TP_Languages_German_Broad- rất ít imp', '59351', U(59351), '', ''],
  ['Profit', 'TP - Profit - Exact 01 - Tier 2 - HU', '81516', U(81516), '', ''],
  ['Profit', 'TP - Profit - Exact 01 - Tier 2 - NO', '78825', U(78825), '', ''],
  ['', '', '', '', '', ''],
];
const idx = buildCampIdIndex_(LINKS);
const r = (n) => resolveCampId_(n, idx);

eq('campIdFromUrl_', campIdFromUrl_(U(74102)), '74102');
eq('normalize: bỏ ! và (CPI nn)', campIdNormalizeName_('! TP - X (CPI 41) - good'), 'TP - X - good');

eq('đúng tên', r('TP - Profit - Exact 01 - Tier 1 - NL'), '74102');
eq('tên + tag CPI', r('TP - Profit - Exact 01 - Tier 1 - NL (CPI 41)'), '74102');
eq('tên + ghi chú tự do', r('TP - Profit - Exact 01 - Tier 1 - NL (net value 64$)'), '74102');
eq('tên + " - ghi chú"', r('TP - Profit - Exact 01 - Tier 1 - NL - watch out'), '74102');
eq('đổi tier 1→2, duy nhất', r('TP - Profit - Exact 01 - Tier 2 - NL'), '74102');
eq('đổi tier + tag', r('TP - Profit - Exact 01 - Tier 3 - ES - focus'), '37597');
eq('không có cột ID → ID từ URL', r('TP - Profit - Exact 01 - Tier 1 - DE'), '73929');
eq('alias 1', r('TP - Brandname - Exact - US - old suffix'), '44442');
eq('alias 2 + tag', r('TP - Brandname - Exact - USA (CPI 9)'), '44442');
eq('hai anh em chỉ khác tier → không đoán', r('TP - Feature - Dashboard - Tier 2 - US'), '');
eq('geo khác → không ghép vào tên ngắn hơn', r('TP - Profit - Exact 01 - Tier 1 - UK'), '');
eq('tên trần ↔ Camp_Links có "! " và "- no ins"', r('TP - Cateogry - Analytics App - Broad 02'), '61821');
eq('khoảng trắng quanh dấu gạch', r('TP_Languages_German_Broad - rất ít imp'), '59351');
eq('hoa thường', r('tp - profit - exact 01 - tier 1 - nl'), '74102');
eq('camp lạ → rỗng', r('Something totally new'), '');
eq('rỗng → rỗng', r(''), '');
eq('"Tier 2" không geo → không ghép bừa vào HU/NO', r('TP - Profit - Exact 01 - Tier 2'), '');

// Camp_Links không có header chuẩn → index rỗng, không ném lỗi
eq('không header → rỗng', resolveCampId_('TP - Profit - Exact 01 - Tier 1 - NL', buildCampIdIndex_([['a', 'b']])), '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
