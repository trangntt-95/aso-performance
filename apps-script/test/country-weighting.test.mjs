// Kiểm tra lib/market/countryWeighting.ts — trọng số quốc gia ở nửa dưới
// trang Market Health.
//
// File này pin lại những chỗ đã sai hoặc gần sai khi làm:
//
//   1. Ghép tên nước. Country_L* ghi 'Türkiye', block doanh thu ghi 'Turkey'.
//      Ghép bằng chuỗi thô là mất $5.070 và 70 users trong im lặng — đúng loại
//      loại-trừ mà module này lẽ ra phải phơi ra chứ không tự gây ra.
//   2. Nước chỉ có users, hoặc chỉ có tiền, vẫn phải có mặt trong bảng: cân
//      theo user thì nhóm đầu mang trọng số thật, cân theo tiền thì nhóm đó là
//      thứ cần kể tên.
//   3. Alert lệch phải bắt cả hai chiều, và không được để nước 2 users chiếm
//      chỗ của nước thật sự đang lệch.
//
// Chạy từ gốc repo:
//   node apps-script/test/country-weighting.test.mjs
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const M = await load('market/countryWeighting.js');

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};
const near = (name, got, want, eps = 1e-9) => {
  if (typeof got === 'number' && Math.abs(got - want) <= eps) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${got}\n       want ${want}`); }
};

// US 800k, Australia 150k, Turkey 50k → tổng 1.000.000, share dễ nhẩm.
const REV = [
  { rank: 1, country: 'United States', installs: 8000, revenue: 800000, valuePerInstall: 100 },
  { rank: 2, country: 'Australia', installs: 1000, revenue: 150000, valuePerInstall: 150 },
  { rank: 3, country: 'Turkey', installs: 500, revenue: 50000, valuePerInstall: 100 },
];

const kw = (country, users, opts = {}) => ({
  country,
  searchTerm: opts.term ?? 'kw',
  surface: opts.surface ?? 'search',
  usersL: users,
  usersP: opts.usersP ?? users,
  getAppL: 0,
  getAppP: 0,
  posL: null,
  posP: null,
});

// Trọng số user lấy mốc ở L90, nên fixture đặt users vào countryL90.
const payload = (l90Rows, extra = {}) => ({
  perGeoRevenue: REV,
  perGeoRevenuePeriod: 'tháng 5-8',
  countryL3: [], countryL7: [], countryL14: [], countryL30: [],
  countryL90: l90Rows,
  ...extra,
});

console.log('Bảng trọng số');
{
  const w = M.buildCountryWeights(payload([
    kw('United States', 100),
    kw('Australia', 100),
    kw('Vietnam', 300),
  ]));
  eq('share tiền = doanh thu ÷ tổng', w.weightOf('United States', 'revenue'), 0.8);
  eq('share user = users ÷ tổng users', w.weightOf('United States', 'users'), 0.2);
  eq('nước không có doanh thu ⇒ trọng số tiền 0', w.weightOf('Vietnam', 'revenue'), 0);
  eq('nhưng vẫn có trọng số user', w.weightOf('Vietnam', 'users'), 0.6);
  eq('nước có tiền mà không users ⇒ trọng số user 0', w.weightOf('Turkey', 'users'), 0);
  eq('nặng nhất theo tiền', w.topByRevenue.country, 'United States');
  eq('nặng nhất theo user', w.topByUsers.country, 'Vietnam');
  eq('đếm nước có doanh thu', w.withRevenue, 3);
  eq('đếm nước có users', w.withUsers, 3);
  eq('mang theo kỳ của block', w.period, 'tháng 5-8');
  eq('không có gì ⇒ null',
    M.buildCountryWeights({ perGeoRevenue: [], countryL90: [] }), null);
  eq('không có data ⇒ null', M.buildCountryWeights(null), null);
}

console.log('\nMọi nước đều có mặt, kể cả khi thiếu một phía');
{
  const w = M.buildCountryWeights(payload([kw('Vietnam', 300)]));
  const vn = w.infoOf('Vietnam');
  eq('nước chỉ có users vẫn có bản ghi', [vn.users, vn.revenue], [300, 0]);
  const tr = w.infoOf('Turkey');
  eq('nước chỉ có tiền vẫn có bản ghi', [tr.users, tr.revenue], [0, 50000]);
  eq('value/install đi kèm để biết nó đáng bao nhiêu', tr.valuePerInstall, 100);
}

console.log('\nGhép tên nước');
{
  const w = M.buildCountryWeights(payload([kw('Türkiye', 70)]));
  eq("'Türkiye' ghép được với 'Turkey'", w.weightOf('Türkiye', 'revenue'), 0.05);
  eq('không nhân đôi thành hai nước', w.infoOf('Turkey').users, 70);
  eq('không phân biệt hoa/thường', w.weightOf('united states', 'revenue'), 0.8);
  eq('bỏ khoảng trắng dư', w.weightOf('  Australia  ', 'revenue'), 0.15);

  const ivory = M.buildCountryWeights({
    perGeoRevenue: [...REV, { rank: 4, country: "cote d'ivoire", revenue: 1000, valuePerInstall: 5 }],
    countryL90: [kw('Côte d’Ivoire', 5)],
  });
  near('dấu ô + nháy cong vẫn ghép', ivory.weightOf('Côte d’Ivoire', 'revenue'), 1000 / 1001000);
  eq('key khớp nên users về đúng nước', ivory.infoOf("cote d'ivoire").users, 5);
}

console.log('\nĐọc tab Country_Lx');
{
  const d = payload([kw('United States', 10)], {
    countryL30: [
      kw('United States', 5),
      kw('(not set)', 500),
      kw('Australia', 7, { surface: 'search_ad' }),
    ],
  });
  eq('bỏ (not set)', M.countryRows(d, 'L30').map((r) => r.country), ['United States', 'Australia']);
  // Tab này hầu hết là dòng paid, nên lọc riêng organic sẽ bỏ mất phần lớn data.
  eq('không lọc surface', M.countryRows(d, 'L30').length, 2);
  eq('window không có tab ⇒ rỗng', M.countryRows(d, 'L365'), []);
}

console.log('\nNước lệch traffic vs doanh thu');
{
  const w = M.buildCountryWeights(payload([
    kw('United States', 100),   // 14% users, 80% tiền → revenue-heavy
    kw('Vietnam', 500),         // 71% users, 0% tiền  → traffic-heavy
    kw('Australia', 95),        // 14% users, 15% tiền → cân, không vào đâu
    kw('Turkey', 5),            // dưới 10 users       → không so tỷ lệ
  ]));
  const r = M.weightMismatch(w);
  eq('traffic nhiều tiền ít', r.trafficHeavy.map((x) => x.country), ['Vietnam']);
  // Turkey chỉ 5 users nên không được so theo tỷ lệ, nhưng nó nắm 5% doanh thu
  // với gần như không có traffic — đúng loại nước dễ bị bỏ qua hoàn toàn, nên
  // vẫn phải nằm ở nhóm revenue-heavy.
  eq('tiền nhiều traffic mỏng', r.revenueHeavy.map((x) => x.country), ['United States', 'Turkey']);
  eq('nước cân không bị gọi tên',
    [...r.trafficHeavy, ...r.revenueHeavy].some((x) => x.country === 'Australia'), false);
  eq('nước dưới 10 users không vào nhóm traffic-heavy',
    r.trafficHeavy.some((x) => x.country === 'Turkey'), false);
  near('share traffic của nhóm traffic-heavy', r.trafficHeavyShare, 500 / 700);
  eq('doanh thu 0 ⇒ ratio null (lệch tuyệt đối)', r.trafficHeavy[0].ratio, null);
  eq('mang theo value/install', r.revenueHeavy[0].valuePerInstall, 100);
  eq('không kể trùng một nước hai lần',
    new Set([...r.trafficHeavy, ...r.revenueHeavy].map((x) => x.country)).size,
    r.trafficHeavy.length + r.revenueHeavy.length);
}
{
  const w = M.buildCountryWeights(payload([kw('Vietnam', 500)]));
  const r = M.weightMismatch(w);
  eq('nước có tiền nhưng 0 traffic vẫn được nêu',
    r.revenueHeavy.map((x) => x.country).sort(), ['Australia', 'Turkey', 'United States']);
}
{
  // Không có doanh thu thì không có gì để so — đừng dựng một alert rỗng.
  const w = M.buildCountryWeights({ perGeoRevenue: [], countryL90: [kw('Vietnam', 500)] });
  eq('không có block doanh thu ⇒ không có alert', M.weightMismatch(w), null);
  eq('không có weights ⇒ null', M.weightMismatch(null), null);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
