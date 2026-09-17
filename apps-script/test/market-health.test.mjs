// Market Health bản 17/09/2026: cầu theo ngày (organic/paid, kỳ này vs kỳ trước)
// và pacing install paid = Shopify Ads + Google Ads so target tháng.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildDemandTrend, buildInstallPacing } = await load('market/marketHealth.js');
const { ADS_MONTHLY_TARGETS } = await load('config/ads-targets.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};
const near = (name, got, want, eps = 1e-6) => {
  if (typeof got === 'number' && Math.abs(got - want) <= eps) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${got}\n       want ${want}`); }
};

const hd = (snapshotDate, searchTerm, surface, usersDaily, getAppDaily, source = 'true_daily') => ({
  snapshotDate, searchTerm, surface, usersL7D: 0, getAppL7D: null, crL7D: null, posL7D: null,
  usersDaily, getAppDaily, crDaily: null, posDaily: null, source,
});
const rows = [];
// 14 ngày 01–14/09: organic 10 users/2 install mỗi ngày kỳ trước, 20/4 kỳ này; paid 5/1 rồi 5/0.
for (let d = 1; d <= 14; d++) {
  const date = `2026-09-${String(d).padStart(2, '0')}`;
  const cur = d >= 8;
  rows.push(hd(date, 'profit', 'search', cur ? 20 : 10, cur ? 4 : 2));
  rows.push(hd(date, 'profit', 'search_ad', 5, cur ? 0 : 1));
  // dòng L7 snapshot không có số ngày → phải bị bỏ
  rows.push(hd(date, 'profit', 'search', null, null, 'l7_snapshot'));
}
// ngày lưu dạng số serial Excel (46279 = 2026-09-14) vẫn đọc được
rows.push(hd(46279, 'trueprofit', 'search', 3, 1));

console.log('buildDemandTrend');
{
  const t = buildDemandTrend(rows, 7);
  eq('asOf = ngày cuối có dữ liệu', t.asOf, '2026-09-14');
  eq('kỳ này 08→14, kỳ trước 01→07', [t.cur.from, t.cur.to, t.prev.from, t.prev.to], ['2026-09-08', '2026-09-14', '2026-09-01', '2026-09-07']);
  eq('organic users kỳ này = 7×20 + 3 (serial)', t.cur.totals.orgUsers, 143);
  eq('organic install kỳ này', t.cur.totals.orgInstalls, 29);
  eq('paid users/install kỳ này', [t.cur.totals.paidUsers, t.cur.totals.paidInstalls], [35, 0]);
  eq('kỳ trước', [t.prev.totals.orgUsers, t.prev.totals.orgInstalls, t.prev.totals.paidUsers, t.prev.totals.paidInstalls], [70, 14, 35, 7]);
  near('delta organic users +104%', t.delta.orgUsers, 73 / 70);
  eq('delta paid install −100%', t.delta.paidInstalls, -1);
  eq('paid share kỳ này', Math.round(t.cur.totals.paidShare * 1000), Math.round((35 / 178) * 1000));
  eq('7 ngày có dữ liệu', t.cur.totals.daysWithData, 7);
  eq('ngày trong kỳ đánh idx 1..7', t.cur.days.map((d) => d.idx), [1, 2, 3, 4, 5, 6, 7]);
  eq('không có dòng theo ngày → null', buildDemandTrend([hd('2026-09-01', 'x', 'search', null, null)], 7), null);
  const t30 = buildDemandTrend(rows, 30);
  eq('kỳ 30 ngày: ngày thiếu điền 0, vẫn 30 ngày', [t30.cur.days.length, t30.cur.totals.daysWithData], [30, 14]);
}

console.log('\nbuildInstallPacing');
{
  const sd = (date, installs) => ({ date, camp: 'A', impressions: 0, clicks: 0, installs, spend: 0, position: null, visibility: null });
  const ca = (date, actionName, conversions) => ({ date, campaignName: 'G', actionName, actionCat: '', conversions, convValue: 0 });
  const shop = [];
  for (let d = 1; d <= 14; d++) shop.push(sd(`2026-09-${String(d).padStart(2, '0')}`, d >= 8 ? 2 : 1));
  const conv = [
    ca('2026-09-10', 'Shopify Store - GA4 (web) shopify_app_install', 3),
    ca('2026-09-11', 'Shopify Store - GA4 (web) click_get_app', 50), // không phải install
    ca('2026-09-03', 'app_install', 2), // kỳ trước
  ];
  const p = buildInstallPacing(shop, conv, 7);
  eq('kỳ theo ngày cuối export Shopify', [p.from, p.to], ['2026-09-08', '2026-09-14']);
  eq('Shopify 14 + Google 3, click_get_app không tính', [p.shopifyInstalls, p.googleInstalls, p.installs], [14, 3, 17]);
  eq('kỳ trước = 7 Shopify + 2 Google', p.prevInstalls, 9);
  const sept = ADS_MONTHLY_TARGETS['2026-09'];
  near('target 7 ngày = target tháng 9 ÷ 30 × 7', p.target, (sept / 30) * 7);
  near('pct = installs ÷ target', p.pct, 17 / ((sept / 30) * 7));
  eq('không thiếu target tháng 9', p.missingTargetMonths, []);
  eq('không có export → null', buildInstallPacing([], conv, 7), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
