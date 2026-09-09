// Kiểm tra lib/market/revenueWeighting.ts — cách cân của cả trang Market Health.
//
// File này pin lại những chỗ đã sai hoặc gần sai khi làm:
//
//   1. Ghép tên nước. Country_L* ghi 'Türkiye', block doanh thu ghi 'Turkey'.
//      Ghép bằng chuỗi thô là mất $5.070 và 70 users trong im lặng — đúng loại
//      loại-trừ mà module này lẽ ra phải phơi ra chứ không tự gây ra.
//   2. Trọng số 0 = loại, và nước bị loại phải được KỂ TÊN. Loại mà không nói
//      thì con số trông như đã tính hết.
//   3. Coverage. Country_L* hầu hết là dòng paid (L90: 2708 paid / 292 organic),
//      nên đo riêng organic ở window ngắn gần như vô nghĩa. Phải tính đúng phần
//      users nằm ngoài chỉ số, chứ không im lặng.
//   4. Rổ keyword phải xếp theo tiền, và phải nói được nó khác thứ tự cũ ở đâu.
//
// Chạy từ gốc repo:
//   node apps-script/test/revenue-weighting.test.mjs
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const M = await load('market/revenueWeighting.js');

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

const kw = (country, usersL, usersP, opts = {}) => ({
  country,
  searchTerm: opts.term ?? 'kw',
  surface: opts.surface ?? 'search',
  usersL,
  usersP,
  getAppL: opts.getAppL ?? 0,
  getAppP: opts.getAppP ?? 0,
  posL: opts.posL ?? null,
  posP: opts.posP ?? null,
});

const payload = (rows, win = 'L30') => {
  const base = {
    perGeoRevenue: REV,
    perGeoRevenuePeriod: 'tháng 5-8',
    countryL3: [], countryL7: [], countryL14: [], countryL30: [], countryL90: [],
  };
  base['country' + win] = rows;
  return base;
};

console.log('Trọng số');
{
  const w = M.buildRevenueWeights(payload([]));
  eq('share = doanh thu ÷ tổng', w.weightOf('United States'), 0.8);
  eq('nước không có doanh thu ⇒ 0', w.weightOf('Vietnam'), 0);
  eq('nước nặng nhất được nêu tên', w.top.country, 'United States');
  eq('số nước có doanh thu', w.count, 3);
  eq('mang theo kỳ của block', w.period, 'tháng 5-8');
  eq('không có block ⇒ null', M.buildRevenueWeights({ perGeoRevenue: [] }), null);
  eq('không có data ⇒ null', M.buildRevenueWeights(null), null);
}

console.log('\nGhép tên nước');
{
  const w = M.buildRevenueWeights(payload([]));
  eq("'Türkiye' ghép được với 'Turkey'", w.weightOf('Türkiye'), 0.05);
  eq('không phân biệt hoa/thường', w.weightOf('united states'), 0.8);
  eq('bỏ khoảng trắng dư', w.weightOf('  Australia  '), 0.15);
  const ivory = M.buildRevenueWeights({
    perGeoRevenue: [...REV, { rank: 4, country: "cote d'ivoire", revenue: 1000, valuePerInstall: 5 }],
  });
  near('dấu ô + nháy cong vẫn ghép', ivory.weightOf('Côte d’Ivoire'), 1000 / 1001000);
}

console.log('\nChỉ số theo window');
{
  const s = M.revenueWeightedStats(
    payload([kw('United States', 100, 50, { getAppL: 10, getAppP: 4 }), kw('Australia', 100, 100)]),
    'L30',
  );
  // 100×0.8 + 100×0.15
  near('indexL', s.indexL, 95);
  near('indexP', s.indexP, 55);          // 50×0.8 + 100×0.15
  near('deltaIndexPct', s.deltaIndexPct, (95 - 55) / 55);
  near('installIndexL', s.installIndexL, 8);
  near('CR cân = install cân ÷ users cân', s.crL, 8 / 95);
  eq('users thô vẫn giữ để đối chiếu', [s.rawUsersL, s.rawUsersP], [200, 150]);
  eq('coverage 100% khi mọi nước có tiền', s.coverage, 1);
  eq('đủ tin', s.reliable, true);
}

console.log('\nNước chưa có doanh thu bị loại và được kể tên');
{
  const s = M.revenueWeightedStats(
    payload([kw('United States', 100, 100), kw('Vietnam', 300, 300), kw('Pakistan', 50, 50)]),
    'L30',
  );
  eq('chỉ nước có tiền vào chỉ số', s.contributors.map((c) => c.country), ['United States']);
  eq('nước bị loại, nhiều users trước',
    s.excluded, [{ country: 'Vietnam', usersL: 300 }, { country: 'Pakistan', usersL: 50 }]);
  near('users không trọng số không vào chỉ số', s.indexL, 80);
  near('coverage = phần users có trọng số', s.coverage, 100 / 450);
  eq('dưới ngưỡng ⇒ không kết luận', s.reliable, false);
}

console.log('\nNgưỡng coverage 0.5');
{
  const at = M.revenueWeightedStats(payload([kw('United States', 51, 51), kw('Vietnam', 49, 49)]), 'L30');
  eq('51/100 ⇒ đủ tin', at.reliable, true);
  const below = M.revenueWeightedStats(payload([kw('United States', 49, 49), kw('Vietnam', 51, 51)]), 'L30');
  eq('49/100 ⇒ không đủ tin', below.reliable, false);
}

console.log('\nLọc surface + (not set)');
{
  const rows = [
    kw('United States', 100, 100, { surface: 'search' }),
    kw('United States', 900, 900, { surface: 'search_ad' }),
  ];
  near('scope all cộng cả hai', M.revenueWeightedStats(payload(rows), 'L30', 'all').indexL, 800);
  near('scope organic', M.revenueWeightedStats(payload(rows), 'L30', 'organic').indexL, 80);
  near('scope paid', M.revenueWeightedStats(payload(rows), 'L30', 'paid').indexL, 720);

  const withNotSet = M.revenueWeightedStats(
    payload([kw('United States', 100, 100), kw('(not set)', 500, 500)]),
    'L30',
  );
  eq('(not set) không bị kể là nước bị loại', withNotSet.excluded, []);
  eq('(not set) không kéo coverage xuống', withNotSet.coverage, 1);
}

console.log('\nPos cân theo doanh thu');
{
  const s = M.revenueWeightedStats(
    payload([
      kw('United States', 100, 100, { posL: 2, posP: 2 }),
      kw('Australia', 100, 100, { posL: 10, posP: 10 }),
    ]),
    'L30',
  );
  // (2×100×0.8 + 10×100×0.15) / (100×0.8 + 100×0.15) = 310/95
  near('Pos nghiêng về nước nhiều tiền', s.posL, 310 / 95);
}

console.log('\nWindow rỗng');
{
  const s = M.revenueWeightedStats(payload([kw('United States', 10, 10)], 'L30'), 'L7');
  eq('tab rỗng ⇒ unavailable, không phải "giảm 100%"', s.unavailable, true);
  eq('không bịa delta', s.deltaIndexPct, null);
  const noPrior = M.revenueWeightedStats(payload([kw('United States', 100, 0)]), 'L30');
  eq('kỳ trước 0 ⇒ delta null, không chia cho 0', noPrior.deltaIndexPct, null);
}

console.log('\nFunnel');
{
  const f = M.revenueWeightedFunnel(
    payload([
      kw('United States', 100, 100, { surface: 'search', getAppL: 10, getAppP: 8 }),
      kw('United States', 200, 200, { surface: 'search_ad', getAppL: 20, getAppP: 20 }),
      kw('Vietnam', 300, 300, { surface: 'search' }),
    ]),
    'L30',
  );
  near('organic index', f.organic.L.users, 80);
  near('paid index', f.paid.L.users, 160);
  near('total = organic + paid', f.total.L.users, 240);
  near('coverage organic tính riêng', f.coverage.organic, 100 / 400);
  eq('coverage paid tính riêng', f.coverage.paid, 1);
  eq('không có window ⇒ null', M.revenueWeightedFunnel(payload([]), 'L7'), null);
}

console.log('\nRổ keyword');
{
  // 'kw-us' chỉ 10 users nhưng toàn US (weight 0.8) → chỉ số 8.
  // 'kw-au' 70 users nhưng 50 ở Australia (0.15) + 20 ở Vietnam (0) → chỉ số 7.5.
  // Xếp theo users thô thì kw-au trên kw-us; xếp theo tiền thì ngược lại — đây
  // chính là điều cần chứng minh.
  const rows = [
    kw('United States', 10, 10, { term: 'kw-us' }),
    kw('Vietnam', 500, 500, { term: 'kw-vn' }),
    kw('Australia', 50, 50, { term: 'kw-au' }),
    kw('Vietnam', 20, 20, { term: 'kw-au' }),
  ];
  const b = M.revenueWeightedBasket(payload(rows, 'L90'), 'L90', 10);
  eq('xếp theo tiền, không theo users', b.map((x) => x.searchTerm), ['kw-us', 'kw-au']);
  eq('keyword không có nước sinh tiền bị bỏ khỏi rổ',
    b.some((x) => x.searchTerm === 'kw-vn'), false);
  near('chỉ số kw-us', b[0].index, 10 * 0.8);
  near('chỉ số kw-au chỉ tính phần Australia', b[1].index, 50 * 0.15);
  eq('users thô vẫn hiện', [b[0].rawUsers, b[1].rawUsers], [10, 70]);
  eq('nêu nước đóng góp nhiều nhất',
    [b[0].topCountry, b[1].topCountry], ['United States', 'Australia']);
  eq('users ở nước chưa có doanh thu được tách ra',
    [b[0].unweightedUsers, b[1].unweightedUsers], [0, 20]);
  // Theo users thô: kw-vn 500, kw-au 70, kw-us 10 → kw-us hạng 3, kw-au hạng 2.
  eq('mang theo hạng cũ để thấy chênh', [b[0].rawRank, b[1].rawRank], [3, 2]);
}

console.log('\nNước lệch traffic vs doanh thu');
{
  const rows = [
    kw('United States', 100, 100),   // 14% users, 80% tiền → revenue-heavy
    kw('Vietnam', 500, 500),         // 71% users, 0% tiền  → traffic-heavy
    kw('Australia', 95, 95),         // 14% users, 15% tiền → cân, không vào đâu
    kw('Turkey', 5, 5),              // dưới 10 users       → không so tỷ lệ
  ];
  const r = M.weightMismatch(payload(rows, 'L90'), 'L90');
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
  eq('mang theo value/install để biết nó đáng bao nhiêu', r.revenueHeavy[0].valuePerInstall, 100);
}
{
  // Nước có tiền mà KHÔNG có traffic là loại đáng chú ý nhất: nó không xuất
  // hiện trong bất kỳ bảng traffic nào nên rất dễ bị bỏ qua hoàn toàn.
  const r = M.weightMismatch(payload([kw('Vietnam', 500, 500)], 'L90'), 'L90');
  eq('nước có tiền nhưng 0 traffic vẫn được nêu',
    r.revenueHeavy.map((x) => x.country).sort(), ['Australia', 'Turkey', 'United States']);
  eq('không kể trùng một nước hai lần',
    new Set(r.revenueHeavy.map((x) => x.country)).size, r.revenueHeavy.length);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
