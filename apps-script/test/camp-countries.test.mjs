// Nước của camp: Geo Camp_Links trước, tên camp (mã nước, tên nước, excl) khi
// Geo trống. Chữ "Tier" không suy ra nước (22/09/2026: tier trong tên camp là
// nhãn bid của Trang, không khớp khối Tier của Countries performance).
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildCampTargetResolver, buildGeoCampsMissingInMaster, targetFromName, coverRank } = await load('market/campCountries.js');
const { findCountriesInText } = await load('sheets/campGeo.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};
const t = (camp) => targetFromName(camp);

console.log('findCountriesInText');
eq('mã 2 chữ + tên đầy đủ', findCountriesInText('Tier 1.5 - NZ, FI, IT'), ['New Zealand', 'Finland', 'Italy']);
eq('tên nhiều chữ, tiếng Việt, alias', findCountriesInText('New Zealand, Tây Ban Nha, Czech, UAE'), ['New Zealand', 'Spain', 'Czechia', 'United Arab Emirates']);
eq('không nhận chữ thường "anh", "nga" trong ghi chú', findCountriesInText('chú ý bid cao, anh nga theo dõi'), []);
eq('KW = keyword, không phải Kuwait', findCountriesInText('Test - Feature KW'), []);
eq('không nhận mã dính chữ', findCountriesInText('ITEM DELIVERY'), []);

console.log('\ntargetFromName');
eq('mã nước sau dấu gạch', t('TP - Brandname - Exact - DE, FR'), { mode: 'include', countries: ['Germany', 'France'], source: 'name', label: 'Tên: Germany, France' });
eq('US 🏆', t('TP - Brandname - Exact - US 🏆').countries, ['United States']);
eq('Tier 2 - PT, RO, CO, UY. IT (NEW): chỉ các nước ghi rõ', t('TP - Profit - Exact 01 - Tier 2 - PT, RO, CO, UY. IT (NEW)').countries, ['Portugal', 'Romania', 'Colombia', 'Uruguay', 'Italy']);
eq('Tier 1 - Japan → Japan (tên nước đầy đủ)', t('TP - Profit - Exact 01 - Tier 1 - Japan').countries, ['Japan']);
eq('Tier 3 (Argentina, Portugal) → include, không phải exclude', t('TP - Profit - Exact 01 - Tier 3 (Argentina, Portugal) new'), { mode: 'include', countries: ['Argentina', 'Portugal'], source: 'name', label: 'Tên: Argentina, Portugal' });
eq('Tier 1 Premium - AU (CPI 14)', t('TP - Profit - Exact 01 - Tier 1 Premium - AU (CPI 14)').countries, ['Australia']);
eq('Tier 1,5 - CH', t('TP - Profit - Exact 01 - Tier 1,5 - CH').countries, ['Switzerland']);
eq('Tier chỉ là nhãn: "Tier 1" không ra nước', t('TP - Feature - Accounting - Tier 1'), { mode: 'unknown', countries: [], source: 'none', label: 'Tên chỉ ghi Tier, không ghi nước — cần Geo trong Camp_Links' });
eq('"Tier 3 (31 countries)" → không đoán', t('TP - Brandname - Exact - Tier 3 (31 countries)').mode, 'unknown');
eq('"Tier 2+" → không đoán', t('TP - Competitor - 01-Beprofit - Tier 2+').mode, 'unknown');
eq('(-IN) → exclude India', t('TP - Competitor - Exact 01 (-IN)'), { mode: 'exclude', countries: ['India'], source: 'name', label: 'Tên: trừ India' });
eq('(-IN, US)', t('TP - Competitor - 01-Beprofit (-IN, US)').countries, ['India', 'United States']);
eq('Excl Phil, US, Austria', t('TP - Competitor - 05- TripleWhale - Excl Phil, US, Austria'), { mode: 'exclude', countries: ['Philippines', 'United States', 'Austria'], source: 'name', label: 'Tên: trừ Philippines, United States, Austria' });
eq('excl BR', t('TP - Feature - Dashboard (CPI 78) - excl BR').countries, ['Brazil']);
eq('excl tier 1,2 → không đoán', t('TP - Competitor - 02- Lifetimely - excl tier 1,2').mode, 'unknown');
eq('(IN, PK) không dấu trừ → include', t('TP - Others - Low bid - Exact 04 (IN, PK)'), { mode: 'include', countries: ['India', 'Pakistan'], source: 'name', label: 'Tên: India, Pakistan' });
eq('không có gì → unknown', t('TP - CPM - Broad 21').mode, 'unknown');
eq('không nhận nhầm chữ thường / số', t('TP - Others - Low bid 08').mode, 'unknown');
eq('ghi chú tiếng Việt không sinh nước', t('TP - Profit - Exact 01 - Excl 3 tiers - chú ý bid cao, ko ins').mode, 'unknown');
eq('camp Language: French không phải France', t('TP_Foreign Languages_French 03').mode, 'unknown');
eq('ngoặc ghi chú có chữ thường không sinh nước', t('TP_Languages_Spanish 5 (ra install IN)').mode, 'unknown');
eq('ngoặc liệt kê nước vẫn đọc', t('TP - Profit - Exact 01 - Tier 2,5 (Norway, Sweden, China)').countries, ['Norway', 'Sweden', 'China']);

console.log('\nbuildCampTargetResolver + coverRank');
const links = [
  { category: 'Profit', camp: 'TP - Profit - Exact 01 - Tier 1 - ES', campaignId: '1', url: '', geoRaw: 'Tây Ban Nha' },
  { category: 'Competitor', camp: 'TP - Competitor - Exact 01 (-IN)', campaignId: '2', url: '', geoRaw: 'All (excl)' },
  { category: 'Brand', camp: 'TP - Brandname - Exact - excl 56', campaignId: '3', url: '', geoRaw: 'exclude:\nTây Ban Nha\nAustralia' },
  { category: 'Brand', camp: 'TP - Brandname - Exact - Tier 3 (31 countries)', campaignId: '4', url: '', geoRaw: 'Austria\r\nColombia\r\nBrazil' },
  { category: 'Profit', camp: 'TP - Profit - Exact 01 - Tier 2 - PT, RO, CO, UY. IT (NEW)', campaignId: '5', url: '', geoRaw: 'Portugal\nRomania\nColombia\nUruguay\nItaly' },
];
const r = buildCampTargetResolver(links);
eq('Geo include thắng', r('TP - Profit - Exact 01 - Tier 1 - ES (net value 24$)'), { mode: 'include', countries: ['Spain'], source: 'geo', label: 'Geo: Spain' });
eq('Geo all + tên có (-IN) → exclude India từ tên', r('TP - Competitor - Exact 01 (-IN)').mode, 'exclude');
eq('Geo exclude', r('TP - Brandname - Exact - excl 56').countries, ['Spain', 'Australia']);
eq('Geo 31 nước (CRLF) thắng chữ Tier 3', coverRank(r('TP - Brandname - Exact - Tier 3 (31 countries)'), 'Colombia'), 0);
eq('không trong Camp_Links → đọc tên, ghi rõ', r('TP - Brandname - Exact - NL, AU'), { mode: 'include', countries: ['Netherlands', 'Australia'], source: 'name', label: 'Tên: Netherlands, Australia · không có trong Camp_Links' });
eq('rank: include có nước → 0', coverRank(r('TP - Profit - Exact 01 - Tier 1 - ES'), 'Spain'), 0);
eq('rank: include không có → 2', coverRank(r('TP - Profit - Exact 01 - Tier 1 - ES'), 'Australia'), 2);
eq('rank: exclude India → 2, Spain → 1', [coverRank(r('TP - Competitor - Exact 01 (-IN)'), 'India'), coverRank(r('TP - Competitor - Exact 01 (-IN)'), 'Spain')], [2, 1]);
eq('rank: unknown → 1, nhưng Vietnam (never target) → 2', [coverRank(r('TP - CPM - Broad 21'), 'Spain'), coverRank(r('TP - CPM - Broad 21'), 'Vietnam')], [1, 2]);
eq('rank: "Tier 3 ( 12 countries)" không trong Camp_Links → 1 (không đoán nữa)', coverRank(r('TP - Profit - Exact 01 - Tier 3 ( 12 countries)'), 'Colombia'), 1);

console.log('\nbuildGeoCampsMissingInMaster');
const master = [
  { category: 'Profit', camp: 'TP - Profit - Exact 01 - Tier 1 - ES (net value 24$)', keyword: 'profit', bidMax: '8' },
  { category: 'Brand', camp: 'TP - Brandname - Exact - excl 56', keyword: 'trueprofit', bidMax: '3' },
];
const miss = buildGeoCampsMissingInMaster(links, [], master);
eq('Colombia: 2 camp Geo phủ mà Master không có keyword', miss('Colombia').map((x) => x.camp), ['TP - Brandname - Exact - Tier 3 (31 countries)', 'TP - Profit - Exact 01 - Tier 2 - PT, RO, CO, UY. IT (NEW)']);
eq('all: mỗi camp một lần, kèm url', miss.all.map((x) => `${x.camp}|${x.url}`), ['TP - Brandname - Exact - Tier 3 (31 countries)|', 'TP - Profit - Exact 01 - Tier 2 - PT, RO, CO, UY. IT (NEW)|']);
eq('Spain: camp ES có trong Master (qua tên có ghi chú) → không báo', miss('Spain'), []);
eq('Geo all / exclude không tính', miss('India'), []);
const miss2 = buildGeoCampsMissingInMaster(links, [{ category: 'Brand', camp: 'TP - Brandname - Exact - Tier 3 (31 countries)', keyword: 'x', bidMax: '' }], master);
eq('camp paused không báo', miss2('Colombia').map((x) => x.camp), ['TP - Profit - Exact 01 - Tier 2 - PT, RO, CO, UY. IT (NEW)']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
