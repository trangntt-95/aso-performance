// Nước của camp: Geo Camp_Links trước, tên camp (mã nước, tier, excl) khi Geo trống.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildCampTargetResolver, targetFromName, coverRank } = await load('market/campCountries.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};
const tier = (t, ...cs) => ({ tier: t, bidText: '', maxBid: null, countries: cs.map((c) => ({ country: c, bidOverride: null, note: '' })) });
const TIERS = [
  tier('Tier 1 - Premium', 'Finland', 'Austria', 'Hong Kong', 'Australia'),
  tier('Tier 1 - Strong', 'United States', 'Spain', 'United Kingdom', 'Germany', 'Netherlands', 'New Zealand', 'France', 'Canada'),
  tier('Tier 1,5', 'Switzerland', 'Poland', 'Sweden', 'Greece', 'Chile', 'Singapore', 'United Arab Emirates', 'Türkiye'),
  tier('Tier 2', 'Portugal', 'Italy', 'Mexico', 'Hungary', 'Norway', 'Uruguay', 'Colombia', 'Romania'),
];
const t = (camp) => targetFromName(camp, TIERS);

console.log('targetFromName');
eq('mã nước sau dấu gạch', t('TP - Brandname - Exact - DE, FR'), { mode: 'include', countries: ['Germany', 'France'], source: 'name', label: 'Tên: Germany, France' });
eq('US 🏆', t('TP - Brandname - Exact - US 🏆').countries, ['United States']);
eq('Tier 2 - PT, RO, CO, UY. IT (NEW): liệt kê nước thắng tier', t('TP - Profit - Exact 01 - Tier 2 - PT, RO, CO, UY. IT (NEW)').countries.sort(), ['Colombia', 'Italy', 'Portugal', 'Romania', 'Uruguay', 'Hungary', 'Mexico', 'Norway'].sort());
eq('Tier 1 Premium - AU → tier + nước', t('TP - Profit - Exact 01 - Tier 1 Premium - AU (CPI 14)').countries.includes('Australia'), true);
eq('Tier 1 → Premium ∪ Strong', t('TP - Feature - Accounting - Tier 1').countries.length, 12);
eq('Tier 1,5 - CH', t('TP - Profit - Exact 01 - Tier 1,5 - CH').countries.includes('Switzerland'), true);
eq('(-IN) → exclude India', t('TP - Competitor - Exact 01 (-IN)'), { mode: 'exclude', countries: ['India'], source: 'name', label: 'Tên: trừ India' });
eq('Excl Phil, US, Austria', t('TP - Competitor - 05- TripleWhale - Excl Phil, US, Austria').countries.sort(), ['Austria', 'Philippines', 'United States']);
eq('excl tier 1,2 → trừ mọi nước tier 1 và 2', t('TP - Competitor - 02- Lifetimely - excl tier 1,2').mode, 'exclude');
eq('Tier 2+ → exclude tier cao hơn', t('TP - Competitor - 01-Beprofit - Tier 2+'), { mode: 'exclude', countries: ['Finland', 'Austria', 'Hong Kong', 'Australia', 'United States', 'Spain', 'United Kingdom', 'Germany', 'Netherlands', 'New Zealand', 'France', 'Canada', 'Switzerland', 'Poland', 'Sweden', 'Greece', 'Chile', 'Singapore', 'United Arab Emirates', 'Türkiye'], source: 'name', label: 'Tên: Tier 2+ (trừ tier cao hơn)' });
eq('không có gì → unknown', t('TP - CPM - Broad 21').mode, 'unknown');
eq('không nhận nhầm chữ thường / số', t('TP - Others - Low bid 08').mode, 'unknown');

console.log('\nbuildCampTargetResolver + coverRank');
const links = [
  { category: 'Profit', camp: 'TP - Profit - Exact 01 - Tier 1 - ES', campaignId: '1', url: '', geoRaw: 'Tây Ban Nha' },
  { category: 'Competitor', camp: 'TP - Competitor - Exact 01 (-IN)', campaignId: '2', url: '', geoRaw: 'All (excl)' },
  { category: 'Brand', camp: 'TP - Brandname - Exact - excl 56', campaignId: '3', url: '', geoRaw: 'exclude:\nTây Ban Nha\nAustralia' },
];
const r = buildCampTargetResolver(links, TIERS);
eq('Geo include thắng', r('TP - Profit - Exact 01 - Tier 1 - ES (net value 24$)'), { mode: 'include', countries: ['Spain'], source: 'geo', label: 'Geo: Spain' });
eq('Geo all + tên có (-IN) → exclude India từ tên', r('TP - Competitor - Exact 01 (-IN)').mode, 'exclude');
eq('Geo exclude', r('TP - Brandname - Exact - excl 56').countries, ['Spain', 'Australia']);
eq('không trong Camp_Links → đọc tên', r('TP - Brandname - Exact - NL, AU').countries, ['Netherlands', 'Australia']);
eq('rank: include có nước → 0', coverRank(r('TP - Profit - Exact 01 - Tier 1 - ES'), 'Spain'), 0);
eq('rank: include không có → 2', coverRank(r('TP - Profit - Exact 01 - Tier 1 - ES'), 'Australia'), 2);
eq('rank: exclude India → 2, Spain → 1', [coverRank(r('TP - Competitor - Exact 01 (-IN)'), 'India'), coverRank(r('TP - Competitor - Exact 01 (-IN)'), 'Spain')], [2, 1]);
eq('rank: unknown → 1, nhưng Vietnam (never target) → 2', [coverRank(r('TP - CPM - Broad 21'), 'Spain'), coverRank(r('TP - CPM - Broad 21'), 'Vietnam')], [1, 2]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
