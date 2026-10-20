// One-off: dựng data/meta-proveny.snapshot.json từ kết quả Meta Ads MCP kéo ngày
// 20/10/2026 (last_30d tới 19/10). Phần daily/campaign/placement/demographic
// chép tay từ output MCP; ads và countries đọc từ file tool-results.
// Khi có META_ACCESS_TOKEN, route /api/meta-proveny gọi Graph API và file này
// chỉ còn là dự phòng.
import fs from 'node:fs';

const d = process.argv[2];
if (!d) throw new Error('usage: node build-snapshot-20261020.mjs <tool-results dir>');
const load = (f) => JSON.parse(JSON.parse(fs.readFileSync(d + '/' + f, 'utf8')).ad_entities);
const num = (v) => {
  if (v == null) return 0;
  if (typeof v === 'object') return Number(v.value) || 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const res = (r) => {
  const x = r.results;
  if (!x) return 0;
  if (x.values && x.values[0]) return Number(x.values[0].value) || 0;
  return 0;
};
const resType = (r) => {
  const t = r.cost_per_result?.conversion_type;
  if (t) return t;
  const v = r.cost_per_result?.value || '';
  const m = /\((.+)\)/.exec(v);
  return m ? m[1] : r.results?.indicator || '';
};

const adsRaw = load('mcp-claude_ai_Meta_Ads-ads_get_ad_entities-1792480855838.txt');
const ads = adsRaw.map((r) => ({
  id: r.id, name: r.name, campaignId: r.campaign_id, campaignName: r.campaign_name, adsetName: r.adset_name,
  status: r.effective_status, createdAt: (r.created_time || '').slice(0, 10),
  spend: num(r.amount_spent), impressions: num(r.impressions), reach: num(r.reach), frequency: num(r.frequency),
  clicks: num(r.clicks), linkClicks: num(r.link_click), lpv: num(r.omni_landing_page_view),
  resultType: resType(r), results: res(r),
  plays: num(r.video_play_actions), thruplays: num(r.video_thruplay_watched_actions),
  p25: num(r.video_p25_watched_actions), p50: num(r.video_p50_watched_actions), p75: num(r.video_p75_watched_actions), p100: num(r.video_p100_watched_actions),
  avgWatchSec: num(r.video_avg_time_watched_actions), engagement: num(r.post_engagement), saves: num(r.post_save), comments: num(r.comment),
  purchases: num(r.offsite_conversion_fb_pixel_purchase),
}));

const cRaw = load('mcp-claude_ai_Meta_Ads-ads_get_ad_entities-1792481059908.txt');
const countries = cRaw
  .map((r) => ({
    country: r.country, spend: num(r.amount_spent), impressions: num(r.impressions), reach: num(r.reach), clicks: num(r.clicks),
    linkClicks: num(r.link_click), lpv: num(r.omni_landing_page_view), plays: num(r.video_play_actions), thruplays: num(r.video_thruplay_watched_actions),
    p25: num(r.video_p25_watched_actions), p100: num(r.video_p100_watched_actions), engagement: num(r.post_engagement),
  }))
  .filter((r) => r.spend > 0 || r.impressions > 0);

// [date, spend, imp, reach, clicks, link, lpv, plays, thru, p25, p100, eng, purchases, purchaseValue, cpFVC, cpTrial, cpSub]
const D = [
  ['2026-10-06', 23.16, 296, 261, 5, 2, 1, 223, 34, 55, 17, 106, 0, 0, null, null, null],
  ['2026-10-07', 47.54, 511, 456, 16, 8, 4, 391, 50, 78, 26, 166, 0, 0, null, 11.885, null],
  ['2026-10-08', 74.16, 5905, 5521, 427, 373, 159, 3438, 318, 553, 152, 1506, 0, 0, null, 6.18, null],
  ['2026-10-09', 64.55, 12206, 9448, 610, 398, 238, 8810, 1071, 2030, 570, 4140, 2, 100, null, 0.717222, 64.55],
  ['2026-10-10', 75.52, 11281, 8517, 456, 128, 71, 7427, 705, 1366, 391, 2913, 0, 0, null, 1.5104, null],
  ['2026-10-11', 109.36, 21039, 15772, 704, 123, 96, 13843, 1321, 2391, 655, 4870, 0, 0, null, 2.144314, null],
  ['2026-10-12', 45.52, 16179, 13211, 436, 65, 42, 10816, 867, 1660, 421, 3460, 0, 0, null, 1.08381, null],
  ['2026-10-13', 182.64, 47823, 33995, 1506, 270, 158, 30058, 4189, 7090, 1980, 12487, 0, 0, null, 1.882887, null],
  ['2026-10-14', 152.63, 45716, 34204, 1384, 221, 148, 30478, 6230, 9140, 2826, 14702, 0, 0, 38.1575, 1.387545, null],
  ['2026-10-15', 99.96, 35505, 28698, 859, 124, 75, 26183, 5575, 7833, 2204, 12237, 0, 0, 11.106667, 1.817455, null],
  ['2026-10-16', 90.26, 24150, 19801, 409, 60, 30, 18717, 2742, 4131, 940, 7050, 0, 0, 90.26, 4.750526, null],
  ['2026-10-17', 106.97, 33075, 25778, 457, 69, 35, 25442, 2946, 4618, 1110, 8479, 0, 0, 21.394, 5.942778, null],
  ['2026-10-18', 105.24, 28266, 22304, 390, 61, 34, 21587, 2360, 3690, 866, 6938, 0, 0, 17.54, 4.575652, 105.24],
  ['2026-10-19', 70.05, 24509, 19445, 252, 38, 19, 18016, 1746, 2585, 629, 5131, 0, 0, 17.5125, 5.003571, null],
];
const cnt = (spend, cp) => (cp ? Math.round(spend / cp) : 0);
const daily = D.map(([date, spend, impressions, reach, clicks, linkClicks, lpv, plays, thruplays, p25, p100, engagement, purchases, purchaseValue, cpF, cpT, cpS]) => ({
  date, spend, impressions, reach, clicks, linkClicks, lpv, plays, thruplays, p25, p100, engagement, purchases, purchaseValue,
  firstVideoCreated: cnt(spend, cpF), startTrials: cnt(spend, cpT), subscribes: cnt(spend, cpS),
}));

// [id, name, status, dailyBudget, created, spend, imp, reach, freq, clicks, link, lpv, resultType, results, plays, thru, p25, p100, eng, purchases, cpTrial, cpSub, cpFVC]
const C = [
  ['120252127467820654', 'Proveny_Sales_1410_First Video Create_WW', 'ACTIVE', 50, '2026-10-14', 506.69, 161241, 100503, 1.604, 2753, 409, 222, 'FirstVideoCreated', 27, 121936, 18790, 27296, 7151, 46447, 0, 3.446871, 506.69, 18.766296],
  ['120252098715280654', 'Proveny_Sales_1310_Create Videos_Ecom Paid Countries', 'PAUSED', 70, '2026-10-13', 65.24, 10295, 7664, 1.343, 291, 47, 28, 'Create Video', 0, 6566, 1196, 1835, 488, 2940, 0, 4.0775, null, null],
  ['120252052104840654', 'Proveny_Sales_1010_Create Videos_Dropship Paid Countries', 'PAUSED', 70, '2026-10-09', 159.03, 40237, 23461, 1.715, 1410, 196, 117, 'Create Video', 14, 22981, 2949, 5087, 1381, 9482, 0, 1.728587, null, null],
  ['120252032784680654', 'Proveny_Sales_0910_Create Videos_Dropship WW', 'PAUSED', 40, '2026-10-08', 117.32, 44188, 30985, 1.426, 2171, 1023, 576, 'Create Video', 59, 28364, 4004, 7234, 2260, 13892, 0, 0.572293, null, 58.66],
  ['120252020635900654', 'Proveny_Sales_0810_Create Videos_Dropship VN', 'PAUSED', 30, '2026-10-08', 135.73, 46353, 25025, 1.852, 1097, 153, 82, 'Create Video', 32, 32244, 2782, 5003, 1286, 9864, 2, 1.443936, 135.73, null],
  ['120252017946980654', 'Proveny_Sales_0810_Create Videos_USUKCAAU', 'PAUSED', 30, '2026-10-08', 143.9, 2817, 1935, 1.456, 148, 92, 73, 'Create Video', 3, 2310, 294, 545, 155, 1119, 0, 5.534615, null, null],
  ['120252010143100654', 'Video ads- Sales_0810_Create Videos', 'PAUSED', 10, '2026-10-07', 20.33, 178, 170, 1.047, 4, 2, 0, 'Create Video', 0, 127, 19, 30, 7, 66, 0, null, null, null],
  ['120251994297270654', 'Video ads- Sales_0710_Visit App', 'PAUSED', 10, '2026-10-06', 81.77, 918, 709, 1.295, 32, 16, 11, 'Visit App', 4, 704, 90, 144, 44, 290, 0, 16.354, null, null],
];
const campaigns = C.map(([id, name, status, dailyBudget, createdAt, spend, impressions, reach, frequency, clicks, linkClicks, lpv, resultType, results, plays, thruplays, p25, p100, engagement, purchases, cpT, cpS, cpF]) => ({
  id, name, status, dailyBudget, createdAt, spend, impressions, reach, frequency, clicks, linkClicks, lpv, resultType, results, plays, thruplays, p25, p100, engagement, purchases,
  startTrials: cnt(spend, cpT), subscribes: cnt(spend, cpS), firstVideoCreated: cnt(spend, cpF),
}));

// [platform, position, device, spend, imp, reach, clicks, link, lpv, plays, thru, p25, p100]; dòng < $1 gộp vào "other"
const P = [
  ['facebook', 'feed', 'desktop', 1123.77, 285233, 141151, 6709, 989, 585, 199599, 28172, 43080, 11742],
  ['facebook', 'feed', 'mobile_app', 30.49, 5759, 5259, 653, 551, 278, 2576, 354, 626, 212],
  ['facebook', 'facebook_reels', 'mobile_app', 38.14, 7420, 5426, 274, 138, 78, 7016, 670, 1770, 422],
  ['instagram', 'instagram_reels', 'mobile_app', 14.28, 1329, 1076, 45, 38, 27, 1164, 82, 191, 41],
  ['facebook', 'marketplace', 'desktop', 8.61, 2647, 1578, 21, 22, 10, 1753, 267, 611, 99],
  ['instagram', 'feed', 'mobile_app', 8.24, 450, 396, 27, 25, 29, 405, 27, 70, 18],
  ['instagram', 'instagram_stories', 'mobile_app', 5.66, 183, 163, 15, 15, 8, 179, 11, 16, 7],
  ['facebook', 'instream_video', 'mobile_app', 3.31, 140, 129, 11, 9, 2, 138, 65, 75, 8],
  ['facebook', 'facebook_stories', 'mobile_app', 2.4, 119, 113, 14, 12, 5, 105, 15, 25, 12],
  ['audience_network', 'an_classic', 'mobile_app', 2.11, 537, 309, 50, 58, 27, 528, 76, 166, 31],
  ['instagram', 'feed', 'desktop', 1.79, 120, 116, 5, 4, 3, 104, 15, 19, 9],
  ['facebook', 'feed', 'mobile_web', 1.45, 52, 44, 2, 1, 1, 43, 3, 7, 3],
  ['whatsapp', 'status', 'mobile_app', 1.37, 1507, 1478, 36, 32, 28, 1273, 254, 347, 98],
  ['audience_network', 'rewarded_video', 'mobile_app', 1.33, 47, 25, 5, 5, 4, 47, 45, 45, 27],
  ['facebook', 'facebook_reels', 'mobile_web', 1.33, 180, 148, 6, 1, 0, 158, 19, 34, 10],
  ['facebook', 'facebook_reels_overlay', 'mobile_app', 1.06, 276, 272, 18, 22, 15, 22, 5, 13, 2],
  ['other', 'other', 'other', 2.22, 462, 400, 20, 18, 10, 0, 0, 0, 0],
];
const placements = P.map(([platform, position, device, spend, impressions, reach, clicks, linkClicks, lpv, plays, thruplays, p25, p100]) => ({ platform, position, device, spend, impressions, reach, clicks, linkClicks, lpv, plays, thruplays, p25, p100 }));

// [age, gender, spend, imp, reach, clicks, link, lpv, thru, p25, p100]
const G = [
  ['18-24', 'female', 12.75, 5381, 3101, 97, 23, 11, 460, 716, 188], ['18-24', 'male', 51.02, 25403, 12848, 404, 116, 66, 1578, 2750, 652], ['18-24', 'unknown', 0.81, 466, 275, 6, 2, 1, 41, 70, 11],
  ['25-34', 'female', 56.26, 17203, 9936, 472, 113, 65, 1754, 2517, 725], ['25-34', 'male', 250.32, 97198, 47913, 1829, 431, 244, 7111, 11680, 2896], ['25-34', 'unknown', 4.3, 1734, 955, 27, 3, 1, 149, 233, 61],
  ['35-44', 'female', 52.15, 10924, 6514, 307, 74, 40, 1504, 2083, 718], ['35-44', 'male', 252, 74330, 36603, 1876, 365, 211, 7455, 11666, 2976], ['35-44', 'unknown', 3.64, 1043, 583, 28, 8, 5, 117, 180, 48],
  ['45-54', 'female', 41.74, 5317, 3251, 205, 60, 25, 889, 1185, 438], ['45-54', 'male', 218.7, 40609, 21143, 1398, 305, 186, 5208, 8024, 2291], ['45-54', 'unknown', 3.91, 747, 413, 28, 7, 4, 103, 159, 48],
  ['55-64', 'female', 28.06, 1827, 1150, 83, 48, 26, 282, 398, 139], ['55-64', 'male', 148.99, 15432, 8087, 702, 201, 116, 2198, 3454, 1008], ['55-64', 'unknown', 3.14, 365, 161, 11, 1, 0, 42, 69, 18],
  ['65+', 'female', 12.21, 1135, 744, 65, 40, 23, 176, 261, 87], ['65+', 'male', 105.07, 7195, 3836, 371, 143, 86, 1070, 1745, 477], ['65+', 'unknown', 2.49, 152, 88, 2, 0, 0, 17, 30, 6],
];
const demographics = G.map(([age, gender, spend, impressions, reach, clicks, linkClicks, lpv, thruplays, p25, p100]) => ({ age, gender, spend, impressions, reach, clicks, linkClicks, lpv, thruplays, p25, p100 }));

const payload = {
  account: { id: '2072888216677399', name: 'Proveny', currency: 'USD', business: 'FireGroup Technology JSC' },
  source: 'snapshot',
  fetchedAt: '2026-10-20T05:20:00.000Z',
  dateRange: { since: '2026-09-20', until: '2026-10-19' },
  daily, campaigns, ads, countries, placements, demographics,
};
fs.writeFileSync('data/meta-proveny.snapshot.json', JSON.stringify(payload));
const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
console.log('daily', sum(daily, 'spend').toFixed(2), 'campaigns', sum(campaigns, 'spend').toFixed(2), 'ads', sum(ads, 'spend').toFixed(2), 'countries', sum(countries, 'spend').toFixed(2), countries.length, 'placements', sum(placements, 'spend').toFixed(2), 'demo', sum(demographics, 'spend').toFixed(2));
console.log('VN', JSON.stringify(countries.find((r) => r.country === 'VN')));
console.log('US', JSON.stringify(countries.find((r) => r.country === 'US')));
