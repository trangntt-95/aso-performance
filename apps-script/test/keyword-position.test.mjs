// Vị trí keyword theo nước qua các cửa sổ: gộp dòng cùng keyword × nước, tier
// từ Max bid cap, top Profit theo users, gia quyền hai kênh.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildPositionRows, topProfitKeywords, cellPos, cellInstalls, isTier23, isTier1, countryTierIndex } = await load('market/keywordPosition.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};
const kw = (category, searchTerm, country, surface, usersL, posL, posP = null, getAppL = 0) =>
  ({ category, searchTerm, country, surface, usersL, usersP: 0, getAppL, getAppP: 0, crL: null, crP: null, posL, posP, deltaPosPct: null, deltaUsersPct: 0, alert: 'OK', lang: '', english: '' });
const cap = (country, tier) => ({ tier, country, countryCode: '', category: 'Brand', keywordCluster: 'B1', exampleKeywords: '', instL90: 0, clicksL30: 0, installsL30: 0, crActual: 0, cpiCap: 0, tierCeiling: 10, bidRecommended: 3, actionRecommended: '' });

const data = {
  bidCap: [cap('Mexico', 'Tier 2'), cap('Brazil', 'Tier 3'), cap('United States', 'Tier 1 Strong')],
  countryL3: [kw('Brand', 'trueprofit', 'Mexico', 'search', 2, 1, 2)],
  countryL7: [
    kw('Brand', 'trueprofit', 'Mexico', 'search', 4, 1.5, 1),
    kw('Brand', 'trueprofit', 'Mexico', 'search_ad', 2, 2, null),
    kw('Brand', 'TruePROFIT', 'Mexico', 'search', 2, 3, null), // biến thể viết → gộp
  ],
  countryL14: [],
  countryL30: [
    kw('Profit', 'profit', 'Brazil', 'search', 20, 4, 5, 3),
    kw('Profit', 'profit calculator', 'Brazil', 'search', 6, 7, null),
    kw('Profit', 'profit tracker', 'United States', 'search_ad', 50, 2, null),
    kw('Feature', 'dashboard', 'Brazil', 'search', 9, 6, null),
    kw('Brand', 'trueprofit', 'Nigeria', 'search', 1, 1, null), // nước không có tier
    kw('Brand', 'silent', 'Brazil', 'search', 3, null, null), // có traffic, không rank → bị loại
  ],
  countryL90: [],
};

const rows = buildPositionRows(data);
eq('dòng không có vị trí nào bị loại', rows.some((r) => r.keyword === 'silent'), false);
eq('số dòng keyword × nước', rows.length, 6);

const mx = rows.find((r) => r.keyword === 'trueprofit' && r.country === 'Mexico');
eq('tier từ Max bid cap', mx.tier, 'Tier 2');
eq('L7 organic gộp 2 biến thể: users 6, pos gia quyền (1.5×4+3×2)/6 = 2', [mx.cells.L7.organic.users, mx.cells.L7.organic.pos], [6, 2]);
eq('L7 paid tách riêng', mx.cells.L7.paid.pos, 2);
eq('L3 posPrev giữ', mx.cells.L3.organic.posPrev, 2);
eq('users tổng mọi cửa sổ, mọi kênh', mx.users, 2 + 4 + 2 + 2);

eq('cellPos organic', cellPos(mx, 'L7', 'organic').pos, 2);
eq('cellPos both gia quyền theo users (6×2 + 2×2)/8', cellPos(mx, 'L7', 'both').pos, 2);
eq('cellPos cửa sổ trống → null', cellPos(mx, 'L14', 'both'), null);

eq('nước không có trong Max bid cap → tier rỗng', rows.find((r) => r.country === 'Nigeria').tier, '');
eq('isTier23', [isTier23('Tier 2'), isTier23('Tier 3'), isTier23('Tier 1.5'), isTier23('Tier 1 Strong'), isTier23('')], [true, true, false, false, false]);
eq('countryTierIndex chữ thường', countryTierIndex(data.bidCap).get('brazil'), 'Tier 3');
eq('isTier1', [isTier1('Tier 1 Premium'), isTier1('Tier 1 Strong'), isTier1('Tier 1.5'), isTier1('Tier 2'), isTier1('Data nhỏ')], [true, true, true, false, false]);
eq('cellInstalls both = organic + paid (0)', cellInstalls(mx, 'L7', 'both'), 0);
const br = rows.find((r) => r.keyword === 'profit' && r.country === 'Brazil');
eq('cellInstalls cửa sổ trống → null', cellInstalls(br, 'L7', 'both'), null);
eq('cellInstalls organic L30 Brazil profit = 3', cellInstalls(br, 'L30', 'organic'), 3);

eq('top Profit theo users: profit tracker (50) > profit (20) > calculator (6)', topProfitKeywords(rows, 2), ['profit tracker', 'profit']);
eq('top Profit mặc định 5 → cả 3', topProfitKeywords(rows).length, 3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
