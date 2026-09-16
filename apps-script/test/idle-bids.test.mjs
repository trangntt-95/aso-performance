// Keyword đang bid mà không có users paid trong cửa sổ — chia ba nhóm theo
// bằng chứng có người tìm (lịch sử L365 + export Shopify).
//
// Vì sao: 920/945 keyword Competitor không có users paid L90 (16/09/2026).
// "Tăng bid để có data" chỉ đúng với keyword có người gõ; nhóm 'none' tăng
// bid không tạo ra phiên tìm. Test pin lại ranh giới ba nhóm và cách chọn
// nguồn (All ∪ Country, L365 rơi về L90).
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildIdleBidsReport, groupOf } = await load('market/idleBids.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

const kwRow = (searchTerm, surface, usersL, getAppL, country) => ({
  category: 'Competitor', searchTerm, country, surface, usersL, usersP: 0, getAppL, getAppP: 0,
  crL: null, crP: null, posL: null, posP: null, deltaPosPct: null, deltaUsersPct: 0, deltaCrPct: null,
  alert: 'none', lang: 'en', english: searchTerm,
});
const snapRow = (searchTerm, surface, users, getApp) => ({
  category: 'Competitor', searchTerm, surface, users, getApp, cr: null, pos: null, sharePct: 0, lang: 'en', english: searchTerm,
});
const master = (camp, keyword, bidMax, category = 'Competitor') => ({ category, camp, keyword, bidMax });
const exportRow = (searchTerm, matchedKeyword, impressions, clicks) => ({
  searchTerm, matchedKeyword, matchType: 'Exact', camp: 'TP - Competitor - Exact 01', bid: null,
  impressions, clicks, installs: 0, spend: 0, position: null, customers: 0, revenue: 0, roas: null, bidStatus: '',
});

const data = {
  masterKwLookup: [
    master('TP - Competitor - Exact 01', 'be profit', '13.1'),      // organic 18 → demand
    master('TP - Competitor - Exact 02', 'be profit', '9'),          // cùng keyword, camp thứ hai
    master('TP - Competitor - Exact 01', 'sellerboard', '9.5'),      // paid L365 có install → demand
    master('TP - Competitor - Exact 01', 'mida', '4'),               // chỉ export impression → weak
    master('TP - Competitor - Exact 01', 'onion', '3'),              // organic 1 → weak
    master('TP - Competitor - Exact 01', 'zonwizard', '2.7'),        // không gì → none
    master('TP - Competitor - Exact 01', 'lifetimely', '10'),        // có users paid L90 → không idle
    master('TP - Competitor - Exact 01', 'roposo', '5'),             // chỉ có ở Country_L90 → không idle
    master('TP - Competitor - PAUSED', 'metorik', '5.5'),            // camp tắt → không active
    master('TP - Profit - Exact 01', 'profit calc', '8', 'Profit'),  // category khác, none
  ],
  pausedKw: [master('TP - Competitor - PAUSED', 'metorik', '5.5')],
  campLinks: [],
  negativeKw: ['zonwizard'],
  allL30: [],
  countryL30: [],
  allL90: [kwRow('lifetimely', 'search_ad', 4, 0)],
  countryL90: [kwRow('roposo', 'search_ad', 2, 0, 'India')],
  allL365: [
    snapRow('be profit', 'search', 18, 3),
    snapRow('sellerboard', 'search_ad', 18, 2),
    snapRow('onion', 'search', 1, 0),
    snapRow('lifetimely', 'search_ad', 30, 1),
  ],
  searchTermUnbidded: [exportRow('mida', 'mida', 97, 0), exportRow('mida replay', 'mida', 24, 1)],
};

console.log('Ba nhóm');
{
  const r = buildIdleBidsReport(data, 'L90');
  const by = Object.fromEntries(r.rows.map((x) => [x.keyword, x]));
  eq('active = 8 keyword (metorik ở camp tắt không tính)', r.activeKeywords, 8);
  eq('idle = 6 (lifetimely có users All, roposo có users Country)', r.rows.length, 6);
  eq('counts', r.counts, { demand: 2, weak: 2, none: 2 });
  eq('be profit: organic 18 → demand, 2 camp, bid max 13.1', [by['be profit'].group, by['be profit'].camps.length, by['be profit'].bidMax], ['demand', 2, 13.1]);
  eq('sellerboard: paid L365 có install → demand', by.sellerboard.group, 'demand');
  eq('mida: chỉ impression export (97+24) → weak', [by.mida.group, by.mida.exportImpressions], ['weak', 121]);
  eq('onion: 1 user organic → weak', by.onion.group, 'weak');
  eq('zonwizard: không gì → none, và đang trong Negative', [by.zonwizard.group, by.zonwizard.negative], ['none', true]);
  eq('lịch sử dùng L365', r.historyWindow, 'L365');
  eq('xếp: demand trước, trong nhóm theo bằng chứng', r.rows.map((x) => x.group), ['demand', 'demand', 'weak', 'weak', 'none', 'none']);
  eq('category đếm active/idle', r.categories, [
    { category: 'Competitor', active: 7, idle: 5 },
    { category: 'Profit', active: 1, idle: 1 },
  ]);
}

console.log('\nNguồn rơi về L90 khi L365 trống');
{
  const r = buildIdleBidsReport({ ...data, allL365: [] }, 'L90');
  eq('historyWindow = L90', r.historyWindow, 'L90');
  const by = Object.fromEntries(r.rows.map((x) => [x.keyword, x]));
  eq('be profit mất lịch sử L365 → none', by['be profit'].group, 'none');
}

console.log('\nCửa sổ L30');
{
  const r = buildIdleBidsReport(data, 'L30');
  eq('L30 trống → mọi keyword active đều idle (8)', r.rows.length, 8);
  eq('lifetimely vẫn demand nhờ L365', r.rows.find((x) => x.keyword === 'lifetimely').group, 'demand');
}

console.log('\ngroupOf');
eq('3 organic → demand', groupOf({ organicUsers: 3, paidUsers: 0, paidInstalls: 0, exportImpressions: 0 }), 'demand');
eq('2 organic → weak', groupOf({ organicUsers: 2, paidUsers: 0, paidInstalls: 0, exportImpressions: 0 }), 'weak');
eq('1 install paid → demand', groupOf({ organicUsers: 0, paidUsers: 1, paidInstalls: 1, exportImpressions: 0 }), 'demand');
eq('5 users paid 0 install → weak', groupOf({ organicUsers: 0, paidUsers: 5, paidInstalls: 0, exportImpressions: 0 }), 'weak');
eq('0 tất cả → none', groupOf({ organicUsers: 0, paidUsers: 0, paidInstalls: 0, exportImpressions: 0 }), 'none');

eq('không có data → null', buildIdleBidsReport(null), null);
eq('Master trống → null', buildIdleBidsReport({ ...data, masterKwLookup: [] }), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
