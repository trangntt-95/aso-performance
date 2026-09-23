// Overbid sau 15/09/2026: chỉ còn luật tỷ lệ (CPC / CPI so mức cho phép).
//
// Luật "tiêu nhiều mà 0 install" đã chuyển hẳn sang Camp Health (bucket đốt
// tiền, bắt từ 2 click). Trước đó 20/21 camp Overbid đỏ đều là camp 0 install
// mà Camp Health đã cờ — hai bảng nói cùng một điều bằng hai ngưỡng khác nhau.
//
// Mốc cho phép tách ra thành buildCampBenchmark để Camp Health dùng chung; test
// pin lại cách nó chọn nước theo Geo, vì đó là chỗ hai bảng phải trùng nhau.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { assessCamps, findOverbidCamps, buildCampBenchmark } = await load('market/overbid.js');

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};
const near = (name, got, want, eps = 1e-6) => {
  if (typeof got === 'number' && Math.abs(got - want) <= eps) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${got}\n       want ${want}`); }
};

const camp = (camp, spend, installs, clicks, impressions = 1000) => ({ camp, spend, installs, clicks, impressions });
const bidRow = (country, category, bid, npi, ceil = 100) => ({
  tier: 'Tier 1 Premium', country, countryCode: '', category, keywordCluster: 'C1', exampleKeywords: '',
  instL90: 0, clicksL30: 0, installsL30: 0, crActual: 0, cpiCap: 0, tierCeiling: ceil,
  bidRecommended: bid, actionRecommended: '', netValue: npi, netValuePrev: null, netValueCurr: null,
  capAt90: npi === null ? null : npi * 0.9, crUsedPct: 50, crSource: '', warning: '',
});
const CAPS = [
  bidRow('United States', 'Profit', 10, 50),   // cap 45
  bidRow('Spain', 'Profit', 4, 20),            // cap 18
  bidRow('India', 'Profit', 1, 5),             // không bao giờ target
  bidRow('United States', 'Brand', 6, 80),
];
const LINKS = [
  { category: 'Profit', camp: 'TP - Profit - Exact 01 - Tier 1 - US', campaignId: '1', url: 'https://x/1', geoRaw: 'Hoa Kỳ' },
  { category: 'Profit', camp: 'TP - Profit - Exact 01 - Tier 2 - ES', campaignId: '2', url: 'https://x/2', geoRaw: 'Tây Ban Nha' },
  { category: 'Profit', camp: 'TP - Profit - General', campaignId: '3', url: 'https://x/3', geoRaw: '' },
  { category: 'Profit', camp: 'TP - Profit - Excl ES', campaignId: '4', url: 'https://x/4', geoRaw: 'Exclude: Spain' },
];

console.log('Luật 0 install đã rời khỏi Overbid');
{
  // Từng là ca kinh điển: $45, 3 click, 0 install → trước đây 'overbid'.
  // Ngưỡng mặc định 2 click (Trang 23/09/2026); 1 click vẫn là nhiễu.
  const rows = assessCamps([camp('TP - Profit - A', 45, 0, 1)], CAPS, [], [], {});
  eq('1 click → low-clicks, không còn overbid', rows[0].verdict, 'low-clicks');
  eq('không dán lý do 0 install', rows[0].reasons, []);
  const rows2 = assessCamps([camp('TP - Profit - A2', 45, 0, 2)], CAPS, [], [], {});
  eq('2 click → được chấm (CPC $22.5 vượt bid) → overbid', rows2[0].verdict, 'overbid');
}
{
  // 6 click 0 install, CPC $2 dưới bid cho phép → chấm bình thường: ok.
  const rows = assessCamps([camp('TP - Profit - I', 12, 0, 6)], CAPS, [], [], {});
  eq('6 click 0 install, CPC dưới mức → ok', rows[0].verdict, 'ok');
  eq('CPI null vì 0 install, không nổ', rows[0].cpi, null);
}
{
  // 0 install nhưng CPC $12 vượt bid cho phép $10 (general Profit trừ India) → overbid theo CPC.
  const rows = assessCamps([camp('TP - Profit - J', 120, 0, 10)], CAPS, [], [], {});
  eq('0 install vẫn bị bắt nếu CPC vượt', rows[0].verdict, 'overbid');
  eq('lý do là CPC, không phải 0 install', rows[0].reasons.length === 1 && /CPC/.test(rows[0].reasons[0]), true);
}
{
  const list = findOverbidCamps([camp('TP - Profit - G', 60, 0, 1), camp('TP - Profit - H', 10, 0, 1)], CAPS, [], [], {});
  eq('camp 1 click 0 install không vào danh sách', list.length, 0);
}

console.log('\nLuật tỷ lệ vẫn như cũ');
{
  const rows = assessCamps([camp('TP - Profit - Exact 01 - Tier 2 - ES', 100, 2, 10)], CAPS, LINKS, [], {});
  const r = rows[0];
  eq('geo ES → so đúng ô Spain', [r.matchLevel, r.countries], ['country', ['Spain']]);
  eq('CPC $10 > bid cho phép $4', r.cpcOverPct !== null, true);
  eq('CPI $50 > trần $18', r.cpiOverPct !== null, true);
  eq('overbid', r.verdict, 'overbid');
}
{
  const rows = assessCamps([camp('TP - Profit - Exact 01 - Tier 1 - US', 100, 4, 20)], CAPS, LINKS, [], {});
  eq('US: CPC $5 < $10, CPI $25 < $45 → ok', rows[0].verdict, 'ok');
}
{
  const paused = [{ category: '', camp: 'TP - Profit - F', keyword: '', bidMax: '' }];
  const rows = assessCamps([camp('TP - Profit - F', 500, 0, 20)], CAPS, [], paused, {});
  eq('camp paused không chấm', rows[0].verdict, 'paused');
}

console.log('\nbuildCampBenchmark — mốc dùng chung với Camp Health');
{
  const bm = buildCampBenchmark(CAPS, LINKS);
  const us = bm('TP - Profit - Exact 01 - Tier 1 - US');
  eq('US: category, nước, match', [us.category, us.countries, us.matchLevel], ['Profit', ['United States'], 'country']);
  near('US: bid cho phép', us.targetBid, 10);
  near('US: trần CPI = NPI×90%', us.targetCpi, 45);
  const es = bm('TP - Profit - Exact 01 - Tier 2 - ES (CPI 29) - watch');
  eq('tên có tag vẫn ghép được geo', es.countries, ['Spain']);
  near('ES: trần CPI', es.targetCpi, 18);
  const gen = bm('TP - Profit - General');
  eq('geo trống → general, trừ India', [gen.matchLevel, gen.countries], ['category', []]);
  near('general: bid TB (10+4)/2', gen.targetBid, 7);
  near('general: trần TB (45+18)/2', gen.targetCpi, 31.5);
  const ex = bm('TP - Profit - Excl ES');
  eq('exclude ES → chỉ còn US', ex.countries, ['United States']);
  near('exclude ES: trần = US', ex.targetCpi, 45);
  const unknown = bm('Random name');
  eq('không đọc được category → không có mốc', [unknown.category, unknown.targetBid, unknown.targetCpi], [null, null, null]);
  const lang = bm('TP - Language - FR');
  eq('category không có trong sheet → không có mốc', [lang.category, lang.targetCpi], ['Language', null]);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
