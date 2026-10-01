// Tìm camp theo Campaign ID: idOf(tên) ra ID của Camp_Links dù tên export mang
// tag / tier cũ; campaignIdFromUrl lấy số cuối URL Shopify (Trang 01/10/2026).
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildCampUrlIndex, campaignIdFromUrl } = await load('sheets/campUrl.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

const idx = buildCampUrlIndex([
  { category: 'Profit', camp: 'TP - Profit - Exact 01 - Tier 1 - NL', campaignId: '74102', url: 'https://partners.shopify.com/832504/ads/74102', geoRaw: '' },
  { category: 'Profit', camp: 'TP - Brandname - Exact - US', campaignId: '', url: 'https://partners.shopify.com/832504/ads/44442', geoRaw: '' },
  { category: 'Profit', camp: 'TP - No Link', campaignId: '', url: '', geoRaw: '' },
]);
eq('tên đúng → ID', idx.idOf('TP - Profit - Exact 01 - Tier 1 - NL'), '74102');
eq('tên có tag → ID', idx.idOf('TP - Profit - Exact 01 - Tier 1 - NL (net value 64$)'), '74102');
eq('tên tier cũ → ID', idx.idOf('TP - Profit - Exact 01 - Tier 2 - NL'), '74102');
eq('không có cột ID → lấy từ URL', idx.idOf('TP - Brandname - Exact - US (CPI 9)'), '44442');
eq('không URL, không ID → undefined', idx.idOf('TP - No Link'), undefined);
eq('camp lạ → undefined', idx.idOf('Something else'), undefined);
eq('campaignIdFromUrl', campaignIdFromUrl('https://partners.shopify.com/832504/ads/74102'), '74102');
eq('campaignIdFromUrl: không URL', campaignIdFromUrl(undefined), undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
