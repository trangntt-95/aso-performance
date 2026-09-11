// Ba grain của tab Net value (keyword / keyword × nước / nước) phải gộp cùng
// một cách: CỘNG rồi chia, cùng ngưỡng 3 shop trả tiền.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildKeywordCountryNetValue, buildCountryNetValue, sumCountryNetValue } = await load('market/keywordNetValue.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};
const row = (surface, keyword, country, installs, payingShops, netValue) =>
  ({ surface, keyword, keywordDecoded: '', cluster: '', country, installs, payingShops, netValue, netPerInstall: installs ? netValue / installs : null, paidCrPct: null, largestShopOrders: null });

const data = { netValuePerInstall: [
  row('search',    'true profit', 'United States', 40, 20, 4000),
  row('search_ad', 'true profit', 'United States', 10,  5,  500),
  row('search_ad', 'true profit', 'Japan',          1,  1, 3273),
  row('search_ad', 'ltv',         'Japan',          1,  1,  100),
  row('search',    'True Profit', 'Canada',         4,  4,  400), // khác hoa/thường → cùng keyword
] };

const kc = buildKeywordCountryNetValue(data);
const us = kc.get('true profit').get('United States');
eq('kw×nước all = cộng hai kênh', [us.all.installs, us.all.netValue, us.all.netPerInstall, us.all.thin], [50, 4500, 90, false]);
eq('kw×nước paid tách riêng', [us.paid.installs, us.paid.netPerInstall, us.paid.thin], [10, 50, false]);
eq('kw×nước organic tách riêng', [us.organic.installs, us.organic.netPerInstall], [40, 100]);
const jp = kc.get('true profit').get('Japan');
eq('Japan 1 shop → mỏng, organic null', [jp.all.thin, jp.paid.netPerInstall, jp.organic], [true, 3273, null]);
eq('hoa/thường gộp về một keyword', kc.get('true profit').get('Canada').all.installs, 4);
eq('keyword lạ → undefined', kc.get('nope'), undefined);

const byC = buildCountryNetValue(data, 'paid');
eq('nước paid: Japan gộp 2 keyword', [byC.get('Japan').installs, byC.get('Japan').netValue, byC.get('Japan').thin], [2, 3373, true]);
eq('nước paid: US chỉ lấy search_ad', byC.get('United States').installs, 10);
eq('nước paid: Canada không có paid', byC.get('Canada'), undefined);
const byAll = buildCountryNetValue(data, 'all');
eq('nước all: Canada có', byAll.get('Canada').installs, 4);

eq('sum include 2 nước = cộng rồi chia', sumCountryNetValue(byC, ['japan', 'United States']).netPerInstall, 3873 / 12);
eq('sum exclude Japan', sumCountryNetValue(byC, ['Japan'], 'exclude').installs, 10);
eq('sum all', sumCountryNetValue(byC, [], 'all').installs, 12);
eq('sum include nước không có → null', sumCountryNetValue(byC, ['Mars']), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
