// Giá trị install ở grain Country × Category cho Bid Cap: category lấy theo
// keyword (bộ phân loại All_L*), cluster chỉ là đường lùi.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildCellNetValue, cellKey, keywordCategoryIndex } = await load('market/cellNetValue.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};
const nv = (surface, keyword, cluster, country, installs, payingShops, netValue) =>
  ({ surface, keyword, keywordDecoded: '', cluster, country, installs, payingShops, netValue, netPerInstall: null, paidCrPct: null, largestShopOrders: null });
const kw = (searchTerm, category, surface = 'search') => ({ searchTerm, category, surface, usersL: 1, getAppL: 0 });

const data = {
  allL365: [kw('profit margin', 'Feature')],           // tab dài thắng
  allL90: [kw('profit margin', 'Profit'), kw('Trueprofit', 'Brand'), kw('lol', 'Noise')],
  allL30: [], allL7: [], countryL90: [], countryL30: [],
  netValuePerInstall: [
    nv('search_ad', 'trueprofit',    'Brand',          'United States', 10, 5, 1000),
    nv('search_ad', 'profit margin', 'Other generic',  'United States',  4, 4,  200), // keyword → Feature (L365), không phải Others theo cluster
    nv('search_ad', 'lol',           'Other generic',  'United States',  2, 2,   20), // Noise → Others
    nv('search_ad', 'zzz unknown',   'Generic profit', 'Germany',        3, 1,   90), // không có trong tab → lùi cluster → Profit
    nv('search_ad', 'no cluster',    '',               'Germany',        1, 1,   10), // không tab, không cluster → bỏ
    nv('search',    'trueprofit',    'Brand',          'United States', 50, 30, 9000), // organic → không vào 'paid'
  ],
};

const idx = keywordCategoryIndex(data);
eq('index: tab dài thắng', idx.get('profit margin'), 'Feature');
eq('index: chuẩn hoá hoa/thường', idx.get('trueprofit'), 'Brand');

const cells = buildCellNetValue(data, 'paid');
eq('US × Brand chỉ paid', [cells.get(cellKey('United States', 'Brand')).installs, cells.get(cellKey('United States', 'Brand')).netPerInstall], [10, 100]);
eq('US × Feature theo keyword, không theo cluster', cells.get(cellKey('United States', 'Feature')).installs, 4);
eq('US × Others = Noise', cells.get(cellKey('United States', 'Others')).installs, 2);
eq('DE × Profit qua cluster fallback, mỏng', [cells.get(cellKey('Germany', 'Profit')).installs, cells.get(cellKey('Germany', 'Profit')).thin], [3, true]);
eq('không phân loại được → không có ô', cells.size, 4);
eq('cellKey không phân biệt hoa/thường', cellKey('United States', 'Brand'), cellKey('united states', 'BRAND'));

const all = buildCellNetValue(data, 'all');
eq('pick all: US × Brand gộp hai kênh', all.get(cellKey('United States', 'Brand')).installs, 60);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
