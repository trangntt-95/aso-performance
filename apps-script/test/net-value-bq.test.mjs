// Net value tự động: gộp install GA4 × shop BigQuery thành đúng schema tab
// 'Net value per install'. Phần thuần, không IO.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildNetValueRows, parseLanding, decodeKeyword } = await load('market/netValueFromBq.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

console.log('parseLanding / decodeKeyword');
eq('đọc surface_type + surface_detail', parseLanding('/trueprofit?locale=es&ot=x&search_id=y&surface_detail=true+p&surface_inter_position=1&surface_type=search_ad'), { surface: 'search_ad', keywordRaw: 'true+p' });
eq('không có surface → null', parseLanding('/trueprofit?locale=es'), { surface: null, keywordRaw: null });
eq('+ và %xx', decodeKeyword('kap%C4%B1da+%C3%B6deme'), 'kapıda ödeme');
eq('%xx hỏng vẫn trả chuỗi', decodeKeyword('abc%E0%A4%A'), 'abc%E0%A4%A');

const inst = (shopId, surface, keywordRaw, yearMonth = '202603') => ({ shopId, surface, keywordRaw, yearMonth });
const shop = (shopId, country, net, paying, orders30 = 0, isTest = false) => [shopId, { shopId, country, net, gross: net, paying, orders30, isTest }];
const installs = [
  inst('1', 'search', 'profit'),
  inst('2', 'search', 'profit'),
  inst('2', 'search', 'profit', '202604'), // cùng shop cài lại → 1 install
  inst('3', 'search', 'Profit'),           // khác hoa thường → cùng nhóm
  inst('4', 'search_ad', 'true+profit'),
  inst('5', 'search_ad', 'true+profit'),   // shop test → bỏ
  inst('6', 'search', 'profit'),           // shop không có trong BigQuery → (unknown)
  inst('7', 'search', 'ltv'),              // Turkey → Türkiye
];
const shops = new Map([
  shop('1', 'United States', 100, true, 12),
  shop('2', 'United States', 0, false, 0),
  shop('3', 'United States', 50, true, 3),
  shop('4', 'Australia', 200, true, 40),
  shop('5', 'Australia', 999, true, 1, true),
  shop('7', 'Turkey', 30, true, 2),
]);
const r = buildNetValueRows(installs, shops, { fromLabel: '01/01/2026', toLabel: '16/09/2026', clusterOf: (k) => (k === 'profit' ? 'Generic profit' : undefined) });
const by = Object.fromEntries(r.rows.map((x) => [`${x.surface}|${x.keywordDecoded}|${x.country}`, x]));

console.log('\nbuildNetValueRows');
eq('profit × US organic: 3 install (shop 2 cài hai lần tính một), 2 paying, net 150', [by['search|profit|United States'].installs, by['search|profit|United States'].payingShops, by['search|profit|United States'].netValue], [3, 2, 150]);
eq('net/install và paid CR', [by['search|profit|United States'].netPerInstall, by['search|profit|United States'].paidCrPct], [50, 2 / 3]);
eq('largest shop 12 đơn, 1 shop 0 đơn', [by['search|profit|United States'].largestShopOrders, by['search|profit|United States'].shopsZeroOrders], [12, 1]);
eq('cluster từ tab cũ', by['search|profit|United States'].cluster, 'Generic profit');
eq('shop test bị bỏ → true profit AU chỉ 1 install', by['search_ad|true profit|Australia'].installs, 1);
eq('keyword giữ dạng thô ở cột Keyword, giải mã ở Keyword (decoded)', [by['search_ad|true profit|Australia'].keyword, by['search_ad|true profit|Australia'].keywordDecoded], ['true+profit', 'true profit']);
eq('shop không có trong BQ → nước (unknown), net 0', [by['search|profit|(unknown)'].installs, by['search|profit|(unknown)'].netValue], [1, 0]);
eq('Turkey → Türkiye', by['search|ltv|Türkiye']?.installs, 1);
eq('stats', r.stats, { installs: 6, payingShops: 4, netValue: 380, shopsMissingCountry: 1, testShopsDropped: 1 });
eq('scope ghi kỳ và nguồn', /01\/01\/2026 → 16\/09\/2026/.test(r.scope) && /BigQuery/.test(r.scope), true);
eq('xếp theo net value giảm dần', r.rows[0].keywordDecoded, 'true profit');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
