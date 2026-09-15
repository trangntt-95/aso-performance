// Trần bid của Underbid tính theo TỪNG CAMP, trên các nước camp target, cùng
// công thức với Bid Rec của sheet: min(giá trị install paid × 90% × CR used,
// Tier ceil), trung bình các nước. Giá trị lấy của keyword × nước khi đủ 3
// shop, không thì NPI Country × Category của sheet.
//
// Ba chỗ dễ sai:
//   1. Một install lạc ở Nhật ($3.273) không được kéo trần của mọi nước khác.
//   2. Trần tier phải chặn TRƯỚC khi trung bình, không phải sau.
//   3. Keyword mỏng (dưới 3 shop) phải lùi về NPI sheet, không dùng số mỏng.
// Và một bài học từ bản thử đầu: hợp geo của mọi camp rồi trung bình một lần
// cho ra cùng một trần cho mọi keyword — phải tính theo camp.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildUnderbidCeilingIndex, verdictOf } = await load('market/underbidCeiling.js');

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

const cap = (country, category, npi, cr, ceil, bid = 1) => ({
  tier: 'Tier 1', country, countryCode: '', category, keywordCluster: 'X', exampleKeywords: '',
  instL90: 0, clicksL30: 0, installsL30: 0, crActual: 0, cpiCap: 0, tierCeiling: ceil,
  bidRecommended: bid, actionRecommended: '', netValue: npi, netValuePrev: null, netValueCurr: null,
  capAt90: null, crUsedPct: cr, crSource: '', warning: '',
});
const nv = (surface, keyword, country, installs, payingShops, netValue) => ({
  surface, keyword, keywordDecoded: '', cluster: '', country, installs, payingShops, netValue,
  netPerInstall: installs ? netValue / installs : null, paidCrPct: null, largestShopOrders: null,
});

const US = 'TP - Profit - Exact 01 - Tier 1 - US';
const ES = 'TP - Profit - Exact 01 - Tier 2 - ES';
const ES_TAG = 'TP - Profit - Exact 01 - Tier 2 - ES (CPI 29)';
const GEN = 'TP - Profit - General';
const EXJP = 'TP - Profit - Excl JP';

const data = {
  bidCap: [
    cap('United States', 'Profit', 100, 25, 40),   // sheet: 100×0.9×0.25 = 22.5 < 40
    cap('Japan', 'Profit', 660, 50, 15),          // sheet: 660×0.9×0.5 = 297 → chặn 15
    cap('Spain', 'Profit', 30, 20, 40),           // sheet: 30×0.9×0.2 = 5.4
    cap('India', 'Profit', 10, 20, 5),            // không bao giờ target
    cap('United States', 'Brand', 120, 60, 40),
  ],
  campLinks: [
    { category: 'Profit', camp: US, campaignId: '1', url: '', geoRaw: 'Hoa Kỳ' },
    { category: 'Profit', camp: ES, campaignId: '2', url: '', geoRaw: 'Tây Ban Nha' },
    { category: 'Profit', camp: GEN, campaignId: '3', url: '', geoRaw: '' },
    { category: 'Profit', camp: EXJP, campaignId: '4', url: '', geoRaw: 'Exclude: Japan' },
  ],
  masterKwLookup: [
    { category: 'Profit', camp: US, keyword: 'profit', bidMax: '$12.5' },
    { category: 'Profit', camp: ES_TAG, keyword: 'profit', bidMax: '8' },
    { category: 'Profit', camp: US, keyword: 'ltv', bidMax: '30' },
  ],
  netValuePerInstall: [
    // keyword 'profit' ở US: paid đủ dày, giá trị 200 (cao hơn NPI sheet 100)
    nv('search_ad', 'profit', 'United States', 10, 5, 2000),
    // organic ở US cao hơn nữa — KHÔNG được dùng cho bid paid
    nv('search', 'profit', 'United States', 50, 30, 10000),
    // Spain: 1 shop → mỏng → lùi về NPI sheet
    nv('search_ad', 'profit', 'Spain', 1, 1, 500),
    // ltv: một install lạc ở Nhật
    nv('search_ad', 'ltv', 'Japan', 1, 1, 3273),
  ],
};
const idx = buildUnderbidCeilingIndex(data);

console.log('Một camp, geo include: đúng nước camp nêu');
{
  const r = idx.compute({ term: 'profit', category: 'Profit', camps: [US], organicCr: 0.18 });
  eq('một camp', r.camps.length, 1);
  const c = r.camps[0];
  eq('một nước, scope geo', [c.countries.map((x) => x.country), c.scope], [['United States'], 'geo']);
  const us = c.countries[0];
  eq('giá trị lấy keyword × nước PAID (200), không lấy organic', [us.value, us.valueSource], [200, 'keyword']);
  eq('CR lấy CR used của ô sheet (25%), không lấy organic', [us.cr, us.crSource], [0.25, 'sheet']);
  near('bid = 200 × 0.9 × 0.25 = 45 → chặn tier 40', us.bid, 40);
  eq('đánh dấu bị chặn', us.capped, true);
  near('trần camp = 40', c.ceiling, 40);
  eq('bid đang set đọc được "$12.5"', c.bidNow, 12.5);
  eq('camp còn chỗ nâng', c.verdict, 'room');
  eq('dòng: min = max = 40, bidNow 12.5, verdict room', [r.ceilingMin, r.ceilingMax, r.bidNow, r.verdict], [40, 40, 12.5, 'room']);
}

console.log('\nKeyword mỏng lùi về NPI sheet; tên camp có tag vẫn ghép được geo và bid');
{
  const r = idx.compute({ term: 'profit', category: 'Profit', camps: [ES_TAG], organicCr: 0.18 });
  const c = r.camps[0];
  eq('nước Spain', c.countries.map((x) => x.country), ['Spain']);
  eq('1 shop → dùng NPI sheet 30', [c.countries[0].value, c.countries[0].valueSource], [30, 'sheet']);
  near('30 × 0.9 × 0.2 = 5.4', c.ceiling, 5.4);
  eq('bid đang set 8 ở camp có tag', c.bidNow, 8);
  eq('8 > 5.4 × 1.1 → đã vượt', c.verdict, 'over');
}

console.log('\nHai camp → hai trần riêng, KHÔNG trung bình chung; camp vượt lên đầu');
{
  const r = idx.compute({ term: 'profit', category: 'Profit', camps: [US, ES_TAG], organicCr: 0.18 });
  eq('camp vượt trần xếp trước', r.camps.map((c) => c.camp), [ES_TAG, US]);
  eq('mỗi camp giữ trần riêng', r.camps.map((c) => +c.ceiling.toFixed(2)), [5.4, 40]);
  eq('khoảng trần của dòng', [r.ceilingMin, r.ceilingMax], [5.4, 40]);
  eq('đếm nhãn', r.counts, { room: 1, 'at-ceiling': 0, over: 1, unknown: 0 });
  eq('dòng lấy nhãn nặng nhất', r.verdict, 'over');
  eq('bidNow = max', r.bidNow, 12.5);
}

console.log('\nGeo trống = mọi nước của category trừ nước không target');
{
  const r = idx.compute({ term: 'profit', category: 'Profit', camps: [GEN], organicCr: 0.18 });
  const c = r.camps[0];
  eq('không có India', c.countries.map((x) => x.country), ['Japan', 'Spain', 'United States']);
  eq('scope category', c.scope, 'category');
  const jp = c.countries.find((x) => x.country === 'Japan');
  near('Nhật: 660 × 0.9 × 0.5 = 297 → chặn 15', jp.bid, 15);
  near('trần camp = (15 + 5.4 + 40) / 3', c.ceiling, (15 + 5.4 + 40) / 3);
  eq('camp không có bid trong Master → unknown', [c.bidNow, c.verdict], [null, 'unknown']);
}

console.log('\nGeo exclude chồng lên nước không target');
{
  const r = idx.compute({ term: 'profit', category: 'Profit', camps: [EXJP], organicCr: 0.18 });
  eq('bỏ Japan và India', r.camps[0].countries.map((x) => x.country), ['Spain', 'United States']);
}

console.log('\nChưa bid ở đâu: một dòng ảo trên mọi nước category');
{
  const r = idx.compute({ term: 'profit', category: 'Profit', camps: [], organicCr: 0.18 });
  eq('một camp ảo', r.camps.map((c) => c.camp), ['(chưa bid)']);
  eq('ba nước', r.camps[0].countries.length, 3);
  eq('không có bid → unknown', r.verdict, 'unknown');
}

console.log('\nMột install lạc không kéo trần');
{
  // ltv: Feature không có trong sheet; camp US → ô Feature × US không có → bỏ.
  const r = idx.compute({ term: 'ltv', category: 'Feature', camps: [US], organicCr: 0.09 });
  eq('camp US nhưng category Feature không có ô US → bỏ qua', r.camps[0].skipped, ['United States']);
  eq('không bịa trần', [r.camps[0].ceiling, r.ceilingMin], [null, null]);
  eq('bid đang set vẫn đọc', r.bidNow, 30);
  eq('verdict unknown', r.verdict, 'unknown');
}

console.log('\nThiếu CR sheet thì lùi về CR organic');
{
  const d2 = { ...data, bidCap: [cap('United States', 'Profit', 100, null, 40)] };
  const r = buildUnderbidCeilingIndex(d2).compute({ term: 'profit', category: 'Profit', camps: [US], organicCr: 0.1 });
  eq('CR organic', [r.camps[0].countries[0].cr, r.camps[0].countries[0].crSource], [0.1, 'organic']);
  near('200 × 0.9 × 0.1 = 18', r.camps[0].ceiling, 18);
  eq('12.5 dưới 90% của 18 → còn chỗ', r.verdict, 'room');
}

console.log('\nverdictOf biên ±10%');
{
  eq('đúng trần', verdictOf(10, 10), 'at-ceiling');
  eq('9.1 → tới trần', verdictOf(10, 9.1), 'at-ceiling');
  eq('8.9 → còn chỗ', verdictOf(10, 8.9), 'room');
  eq('11.1 → vượt', verdictOf(10, 11.1), 'over');
  eq('thiếu bid → unknown', verdictOf(10, null), 'unknown');
  eq('thiếu trần → unknown', verdictOf(null, 5), 'unknown');
}

console.log('\nBrandname → Brand');
{
  const r = idx.compute({ term: 'trueprofit', category: 'Brandname', camps: [US], organicCr: 0.5 });
  eq('tra được ô Brand × US', r.camps[0].countries.map((c) => [c.country, c.value]), [['United States', 120]]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
