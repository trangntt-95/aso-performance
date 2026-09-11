// Camp brand đã top vị trí: vị trí gia quyền theo impressions, cửa sổ neo vào
// ngày mới nhất, verdict theo vị trí + visibility + đủ impressions.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { findBrandTopCamps } = await load('market/brandTop.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

const day = (date, camp, impressions, spend, position, visibility, installs = 0) =>
  ({ date, camp, impressions, clicks: 0, installs, spend, position, visibility });

const links = [
  { category: 'Brandname', camp: 'TP - Brandname - Exact - US', campaignId: '1', url: 'https://x/1', geoRaw: 'Hoa Kỳ' },
  { category: 'Brandname', camp: 'TP - Brandname - Misspell', campaignId: '2', url: 'https://x/2', geoRaw: 'All (excl)' },
  { category: 'Brandname', camp: 'TP - Brandname - Exact - DE', campaignId: '3', url: 'https://x/3', geoRaw: 'Đức' },
  { category: 'Profit', camp: 'TP - Profit - Exact 01 - Tier 1 - US', campaignId: '4', url: 'https://x/4', geoRaw: 'Hoa Kỳ' },
  { category: 'Brandname', camp: 'TP - Brandname - Exact - Paused', campaignId: '5', url: 'https://x/5', geoRaw: 'Spain' },
];
const master = [
  { category: 'Brandname', camp: 'TP - Brandname - Exact - US', keyword: 'trueprofit', bidMax: '4' },
  { category: 'Brandname', camp: 'TP - Brandname - Exact - US', keyword: 'true profit', bidMax: '6' },
  { category: 'Brandname', camp: 'TP - Brandname - Exact - US', keyword: 'true profo', bidMax: '2' },
  { category: 'Brandname', camp: 'TP - Brandname - Exact - DE', keyword: 'trueprofit', bidMax: '3' },
];
const paused = [{ category: 'Brandname', camp: 'TP - Brandname - Exact - Paused', keyword: '', bidMax: '' }];
const bidCap = [
  { tier: 'Tier 1', country: 'United States', countryCode: 'US', category: 'Brand', keywordCluster: 'B1', exampleKeywords: '', instL90: 0, clicksL30: 0, installsL30: 0, crActual: 0, cpiCap: 0, tierCeiling: 10, bidRecommended: 3, bidNow: null, actionRecommended: '' },
  { tier: 'Tier 1', country: 'Germany', countryCode: 'DE', category: 'Brand', keywordCluster: 'B1', exampleKeywords: '', instL90: 0, clicksL30: 0, installsL30: 0, crActual: 0, cpiCap: 0, tierCeiling: 10, bidRecommended: 2, bidNow: null, actionRecommended: '' },
];
const country = [
  { category: 'Brand', searchTerm: 'trueprofit', country: 'United States', surface: 'search', usersL: 90, usersP: 0, getAppL: 0, getAppP: 0, crL: 0, crP: 0, posL: 1, posP: null, deltaPosPct: null, deltaUsersPct: null, deltaCrPct: null, alert: '', lang: '', english: '' },
  { category: 'Brand', searchTerm: 'trueprofit', country: 'United States', surface: 'search_ad', usersL: 5, usersP: 0, getAppL: 0, getAppP: 0, crL: 0, crP: 0, posL: 2, posP: null, deltaPosPct: null, deltaUsersPct: null, deltaCrPct: null, alert: '', lang: '', english: '' },
  { category: 'Brand', searchTerm: 'trueprofit', country: 'Germany', surface: 'search', usersL: 10, usersP: 0, getAppL: 0, getAppP: 0, crL: 0, crP: 0, posL: 3, posP: null, deltaPosPct: null, deltaUsersPct: null, deltaCrPct: null, alert: '', lang: '', english: '' },
];

const daily = [
  // US: 2 ngày, vị trí 1.0 (imp 30) và 2.0 (imp 10) → gia quyền 1.25; vis 1.0 / 0.6 → 0.9
  day('2026-09-09', 'TP - Brandname - Exact - US (CPI 9)', 30, 10, 1.0, 1.0, 1),
  day('2026-09-10', 'TP - Brandname - Exact - US', 10, 5, 2.0, 0.6),
  // Misspell: top nhưng vis thấp → watch
  day('2026-09-10', 'TP - Brandname - Misspell', 50, 4, 1.1, 0.5),
  // DE: xa top
  day('2026-09-10', 'TP - Brandname - Exact - DE', 40, 9, 3.2, 0.9),
  // Profit: không phải brand → bỏ
  day('2026-09-10', 'TP - Profit - Exact 01 - Tier 1 - US', 100, 50, 1.0, 1.0),
  // Paused → bỏ
  day('2026-09-10', 'TP - Brandname - Exact - Paused', 100, 50, 1.0, 1.0),
  // Ngoài cửa sổ 14 ngày (neo 10/09 → từ 28/08)
  day('2026-08-20', 'TP - Brandname - Exact - US', 1000, 100, 5.0, 0.1),
  // Ít impressions
  day('2026-09-10', 'TP - Brandname - Tiny', 3, 1, 1.0, 1.0),
];

const res = findBrandTopCamps(daily, links, master, paused, bidCap, country, { days: 14 });
eq('cửa sổ neo vào ngày mới nhất', [res.from, res.to], ['2026-08-28', '2026-09-10']);
eq('có vị trí', res.hasPosition, true);
eq('chỉ camp brand, bỏ paused', res.rows.map((r) => r.camp).sort(), ['TP - Brandname - Exact - DE', 'TP - Brandname - Exact - US', 'TP - Brandname - Misspell', 'TP - Brandname - Tiny']);

const us = res.rows.find((r) => r.camp === 'TP - Brandname - Exact - US');
eq('US: gộp tên có tag CPI, imp 40', us.impressions, 40);
eq('US: vị trí gia quyền 1.25', Number(us.position.toFixed(3)), 1.25);
eq('US: visibility gia quyền 0.9', Number(us.visibility.toFixed(3)), 0.9);
eq('US: đã top', us.verdict, 'top');
eq('US: nước từ Geo', us.countries, ['United States']);
eq('US: bid nay = median(2,4,6) = 4, rec = 3', [us.bidNow, us.bidRec], [4, 3]);
eq('US: organic pos chỉ lấy organic', [us.organicPos, us.organicUsers], [1, 90]);
eq('US: url', us.url, 'https://x/1');

const mis = res.rows.find((r) => r.camp === 'TP - Brandname - Misspell');
eq('Misspell: top nhưng vis 50% → watch', mis.verdict, 'watch');
eq('Misspell: general → organic gộp mọi nước (US 90@1 + DE 10@3)', Number(mis.organicPos.toFixed(2)), 1.2);
eq('Misspell: bid rec = trung bình mọi ô Brand', mis.bidRec, 2.5);

eq('DE: còn xa top', res.rows.find((r) => r.camp === 'TP - Brandname - Exact - DE').verdict, 'ok');
eq('Tiny: ít impressions', res.rows.find((r) => r.camp === 'TP - Brandname - Tiny').verdict, 'low-data');
eq('sắp: top trước, rồi watch, ok, low-data', res.rows.map((r) => r.verdict), ['top', 'watch', 'ok', 'low-data']);

// Không có cột vị trí → hasPosition false, verdict no-position
const noPos = findBrandTopCamps(
  [day('2026-09-10', 'TP - Brandname - Exact - US', 50, 10, null, null)],
  links, master, paused, bidCap, country, { days: 14 },
);
eq('không có vị trí → hasPosition false', noPos.hasPosition, false);
eq('không có vị trí → no-position', noPos.rows[0].verdict, 'no-position');

// Ngưỡng tuỳ chỉnh
const strict = findBrandTopCamps(daily, links, master, paused, bidCap, country, { days: 14, maxPos: 1.2 });
eq('maxPos 1.2 → US (1.25) thành watch', strict.rows.find((r) => r.camp === 'TP - Brandname - Exact - US').verdict, 'watch');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
