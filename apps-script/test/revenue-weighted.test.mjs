// Kiểm tra lib/market/revenueWeighted.ts — verdict cân theo doanh thu.
//
// File này pin lại ba thứ đã từng sai hoặc gần sai khi làm:
//
//   1. Ghép tên nước. Country_L* ghi 'Türkiye', block doanh thu ghi 'turkey'.
//      Nếu ghép bằng chuỗi thô thì nước đó bị loại âm thầm — mất $430 và 13
//      users mà không ai thấy. Đây đúng là loại lỗi mà module này lẽ ra phải
//      phơi ra chứ không tự gây ra.
//   2. Trọng số 0 = loại, và nước bị loại phải được KỂ TÊN. Loại mà không nói
//      thì con số trông như đã tính hết.
//   3. Ngưỡng coverage. Dưới một nửa users organic có trọng số thì delta không
//      được trích dẫn.
//
// Chạy từ gốc repo:
//   node apps-script/test/revenue-weighted.test.mjs
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { buildRevenueWeighted } = await load('market/revenueWeighted.js');

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

// Doanh thu: US đặt trọng số 1, Australia 0.5, turkey ghi thường không dấu.
const revenue = [
  { rank: 1, country: 'United States', revenue: 100000 },
  { rank: 2, country: 'Australia', revenue: 50000 },
  { rank: 3, country: 'turkey', revenue: 500 },
];
const kw = (country, usersL, usersP, surface = 'search') => ({
  country, usersL, usersP, surface,
});
const payload = (rows) => ({
  perGeoRevenue: revenue,
  countryL3: rows, countryL7: [], countryL14: [], countryL30: [], countryL90: [],
});

console.log('Cơ sở trọng số');
{
  const r = buildRevenueWeighted(payload([kw('United States', 10, 10)]));
  eq('nước doanh thu lớn nhất là mốc', r.base.country, 'United States');
  eq('số nước có doanh thu', r.countriesWithRevenue, 3);
  eq('mốc mang trọng số 1', r.windows[0].contributors[0].weight, 1);
}

console.log('\nTrọng số theo tỷ lệ doanh thu');
{
  const r = buildRevenueWeighted(payload([kw('United States', 100, 100), kw('Australia', 100, 100)]));
  const w = r.windows[0];
  // 100×1 + 100×0.5
  eq('weightedL', w.weightedL, 150);
  eq('weightedP', w.weightedP, 150);
  eq('delta 0 khi không đổi', w.deltaPct, 0);
  eq('coverage 100%', w.coverage, 1);
  eq('đủ tin', w.reliable, true);
}

console.log('\nGhép tên nước — dấu và chữ hoa/thường');
{
  const r = buildRevenueWeighted(payload([kw('Türkiye', 13, 10)]));
  const w = r.windows[0];
  eq('Türkiye ghép được với "turkey"', w.contributors.map((c) => c.country), ['Türkiye']);
  eq('lấy đúng doanh thu', w.contributors[0].revenue, 500);
  eq('không bị loại', w.excluded, []);
}
{
  // Dấu nháy cong trong 'Côte d’Ivoire' vs nháy thẳng trong dữ liệu doanh thu.
  const r = buildRevenueWeighted({
    perGeoRevenue: [...revenue, { rank: 4, country: "cote d'ivoire", revenue: 100 }],
    countryL3: [kw('Côte d’Ivoire', 5, 4)],
    countryL7: [], countryL14: [], countryL30: [], countryL90: [],
  });
  eq('nháy cong ghép được với nháy thẳng', r.windows[0].contributors.length, 1);
}

console.log('\nKhông có doanh thu ⇒ trọng số 0, và phải kể tên');
{
  const r = buildRevenueWeighted(payload([
    kw('United States', 100, 100),
    kw('Vietnam', 106, 90),
    kw('Pakistan', 40, 30),
  ]));
  const w = r.windows[0];
  eq('chỉ US kéo chỉ số', w.contributors.map((c) => c.country), ['United States']);
  eq('nước bị loại được kể tên, nhiều users trước',
    w.excluded, [{ country: 'Vietnam', usersL: 106 }, { country: 'Pakistan', usersL: 40 }]);
  eq('users không trọng số không vào chỉ số', w.weightedL, 100);
  // 100 / (100+106+40)
  eq('coverage = phần users có trọng số', Math.round(w.coverage * 1000) / 1000, 0.407);
  eq('dưới ngưỡng ⇒ không đủ tin', w.reliable, false);
}

console.log('\nNgưỡng coverage 0.5');
{
  const at = buildRevenueWeighted(payload([kw('United States', 51, 51), kw('Vietnam', 49, 49)]));
  eq('51/100 ⇒ đủ tin', at.windows[0].reliable, true);
  const below = buildRevenueWeighted(payload([kw('United States', 49, 49), kw('Vietnam', 51, 51)]));
  eq('49/100 ⇒ không đủ tin', below.windows[0].reliable, false);
}

console.log('\nLọc nguồn');
{
  const r = buildRevenueWeighted(payload([
    kw('United States', 100, 100),
    kw('United States', 900, 900, 'search_ad'),
  ]));
  // Trọng số của sheet dựng từ organic search, nên paid không được lẫn vào.
  eq('bỏ search_ad', r.windows[0].weightedL, 100);
}
{
  const r = buildRevenueWeighted(payload([kw('United States', 100, 100), kw('(not set)', 500, 500)]));
  const w = r.windows[0];
  eq('(not set) không bị kể là nước bị loại', w.excluded, []);
  eq('(not set) không kéo coverage xuống', w.coverage, 1);
}

console.log('\nCửa sổ rỗng');
{
  const r = buildRevenueWeighted(payload([kw('United States', 10, 10)]));
  const l365ish = r.windows.filter((w) => w.unavailable).map((w) => w.window);
  eq('tab rỗng ⇒ unavailable, không phải "giảm 100%"', l365ish, ['L7', 'L14', 'L30', 'L90']);
  eq('không bịa delta', r.windows[1].deltaPct, null);
}

console.log('\nKhông có block doanh thu');
{
  eq('không có doanh thu ⇒ không có báo cáo',
    buildRevenueWeighted({ perGeoRevenue: [], countryL3: [], countryL7: [], countryL14: [], countryL30: [], countryL90: [] }),
    null);
  eq('không có data ⇒ null', buildRevenueWeighted(null), null);
}

console.log('\nCặp đối chiếu value/install');
{
  const withVpi = [
    { rank: 1, country: 'United States', revenue: 100000, valuePerInstall: 60 },
    { rank: 2, country: 'Brazil', revenue: 10000, valuePerInstall: 3 },
  ];
  const mk = (rows) => ({
    perGeoRevenue: withVpi,
    countryL3: [], countryL7: [], countryL14: [], countryL30: [], countryL90: rows,
  });
  const r = buildRevenueWeighted(mk([kw('United States', 50, 50), kw('Brazil', 50, 50)]));
  eq('lấy nước đáng giá nhất làm rich', r.contrast.rich.country, 'United States');
  eq('lấy nước rẻ nhất làm poor', r.contrast.poor.country, 'Brazil');
  eq('kèm value/install để copy khỏi phải hardcode', r.contrast.rich.valuePerInstall, 60);

  // Mẫu quá nhỏ thì value/install nói lên rất ít — Kuwait $200 tren 2 install la
  // ví dụ thật trong sheet — nên không được đem ra làm dẫn chứng.
  const thin = buildRevenueWeighted(mk([kw('United States', 50, 50), kw('Brazil', 2, 2)]));
  eq('dưới 5 users thì không dùng làm dẫn chứng', thin.contrast, null);

  // Hai nước gần nhau thì cặp đối chiếu không chứng minh gì.
  const close = buildRevenueWeighted({
    perGeoRevenue: [
      { rank: 1, country: 'United States', revenue: 100000, valuePerInstall: 60 },
      { rank: 2, country: 'Canada', revenue: 10000, valuePerInstall: 50 },
    ],
    countryL3: [], countryL7: [], countryL14: [], countryL30: [],
    countryL90: [kw('United States', 50, 50), kw('Canada', 50, 50)],
  });
  eq('chênh dưới 3 lần thì không nói gì', close.contrast, null);

  // Cửa sổ rộng nhất mới đủ mẫu; L3 vài user một nước là nhiễu.
  const shortOnly = buildRevenueWeighted({
    perGeoRevenue: withVpi,
    countryL3: [kw('United States', 50, 50), kw('Brazil', 50, 50)],
    countryL7: [], countryL14: [], countryL30: [], countryL90: [],
  });
  eq('không có cửa sổ rộng thì lấy cửa sổ có data', shortOnly.contrast.rich.country, 'United States');
}

console.log('\nKỳ trước rỗng');
{
  const r = buildRevenueWeighted(payload([kw('United States', 100, 0)]));
  eq('P = 0 ⇒ delta null, không chia cho 0', r.windows[0].deltaPct, null);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
