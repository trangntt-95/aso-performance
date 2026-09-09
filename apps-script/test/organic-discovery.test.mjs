// Kiểm tra lib/market/organicDiscovery.ts — đuôi organic mà All_L* bị cắt mất.
//
// Hai chỗ dễ sai nhất, và cả hai đều sai âm thầm:
//
//   1. usersL7D là rolling 7 ngày, KHÔNG cộng được. Cộng bảy ngày liền nhau là
//      đếm mỗi user tới bảy lần, ra một con số to trông rất thuyết phục.
//      Chỉ cột usersDaily mới được cộng.
//   2. Cột ngày có cả chuỗi ISO và serial Excel trong cùng một tab (data thật:
//      '2026-02-01' nằm cạnh 46244), và serial còn có thể là chuỗi số sau khi
//      qua JSON. Đọc sót một dạng thì cả cửa sổ trống mà không có lỗi nào.
//
// Chạy từ gốc repo:
//   node apps-script/test/organic-discovery.test.mjs
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const M = await load('market/organicDiscovery.js');

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

// All_L* chỉ có 'trueprofit' → mọi term khác là đuôi.
const allRow = (term) => ({ searchTerm: term, surface: 'search', usersL: 10, usersP: 10, getAppL: 1, getAppP: 1 });
const hd = (date, term, opts = {}) => ({
  snapshotDate: date,
  searchTerm: term,
  surface: opts.surface ?? 'search',
  usersL7D: opts.usersL7D ?? 0,
  getAppL7D: null,
  crL7D: null,
  posL7D: opts.posL7D ?? null,
  usersDaily: opts.usersDaily ?? null,
  getAppDaily: opts.getAppDaily ?? null,
  crDaily: null,
  posDaily: opts.posDaily ?? null,
  source: 'daily_perday',
});
const h = (date, term, usersL7D, posL7D = null) => ({
  snapshotDate: date,
  searchTerm: term,
  surface: 'search',
  usersL7D,
  posL7D,
  alert: 'OK',
});

const payload = (extra = {}) => ({
  allL3: [], allL7: [], allL14: [], allL30: [], allL90: [],
  allL365: [{ searchTerm: 'trueprofit', surface: 'search', users: 100, getApp: 10 }],
  historyDaily: [],
  history: [],
  ...extra,
});

console.log('Đọc ngày');
{
  eq('chuỗi ISO', M.snapshotDateIso('2026-02-01'), '2026-02-01');
  eq('ISO có kèm giờ', M.snapshotDateIso('2026-02-01T00:00:00Z'), '2026-02-01');
  // 46244 tính từ epoch 1899-12-30 của Excel — con số này lấy từ data thật.
  eq('serial Excel dạng số', M.snapshotDateIso(46244), '2026-08-10');
  eq('serial Excel dạng chuỗi (sau JSON)', M.snapshotDateIso('46244'), '2026-08-10');
  eq('rỗng ⇒ null', M.snapshotDateIso(''), null);
  eq('null ⇒ null', M.snapshotDateIso(null), null);
  eq('số vô nghĩa ⇒ null', M.snapshotDateIso(3), null);
}

console.log('\nChỉ nhận term không có trong All_L*');
{
  const r = M.buildOrganicDiscovery(
    payload({
      allL30: [allRow('profit')],
      historyDaily: [
        hd('2026-09-01', 'profit', { usersDaily: 5 }),
        hd('2026-09-01', 'polar analytics', { usersDaily: 2 }),
      ],
    }),
  );
  eq('term đã có trong All_L* bị bỏ', r.terms.map((t) => t.keyword), ['polar analytics']);
  eq('đếm được universe cũ', r.knownTerms, 2); // 'profit' + 'trueprofit'
}

console.log('\nCộng theo cửa sổ, lấy mốc từ ngày mới nhất của snapshot');
{
  // Mốc = 2026-09-10. 09-08 cách 2 ngày, 08-20 cách 21 ngày, 06-20 cách 82.
  const r = M.buildOrganicDiscovery(
    payload({
      historyDaily: [
        hd('2026-09-10', 'kw', { usersDaily: 1, getAppDaily: 1 }),
        hd('2026-09-08', 'kw', { usersDaily: 2 }),
        hd('2026-08-20', 'kw', { usersDaily: 4 }),
        hd('2026-06-20', 'kw', { usersDaily: 8 }),
      ],
    }),
  );
  const t = r.terms[0];
  eq('mốc là ngày mới nhất trong snapshot, không phải hôm nay', r.asOf, '2026-09-10');
  eq('L7 = 2 ngày gần nhất', t.wins.l7.users, 3);
  eq('L30 cộng dồn, gồm cả L7', t.wins.l30.users, 7);
  eq('L90 cộng dồn tiếp', t.wins.l90.users, 15);
  eq('L365 gồm hết', t.wins.l365.users, 15);
  eq('install cũng cộng', t.wins.l7.installs, 1);
  eq('khoảng ngày thấy term', [t.firstSeen, t.lastSeen], ['2026-06-20', '2026-09-10']);
}

console.log('\nKhông cộng rolling L7D');
{
  // Bảy ngày liền, mỗi ngày rolling báo 7 users, per-day thật là 1.
  const rows = [];
  for (let d = 4; d <= 10; d++) {
    rows.push(hd(`2026-09-${String(d).padStart(2, '0')}`, 'kw', { usersDaily: 1, usersL7D: 7 }));
  }
  const t = M.buildOrganicDiscovery(payload({ historyDaily: rows })).terms[0];
  eq('L7 lấy per-day (7), không phải rolling (49)', t.wins.l7.users, 7);
  eq('có per-day rồi thì không báo thêm đỉnh rolling', t.rollingUsersMax, null);
}

console.log('\nTerm chỉ có trong History (chỉ có rolling)');
{
  const r = M.buildOrganicDiscovery(
    payload({ history: [h('2026-09-01', 'chi rolling', 3, 4.5), h('2026-08-25', 'chi rolling', 2)] }),
  );
  const t = r.terms[0];
  eq('vẫn được nêu tên', t.keyword, 'chi rolling');
  eq('không có số cộng được', t.wins, {});
  eq('mang riêng đỉnh rolling, có nhãn riêng', t.rollingUsersMax, 3);
  eq('ghi rõ tìm thấy ở tab nào', t.from, 'History');
  eq('vị trí tốt nhất', t.bestPos, 4.5);
}

console.log('\nBỏ paid, bỏ dòng không có số');
{
  const r = M.buildOrganicDiscovery(
    payload({
      historyDaily: [
        hd('2026-09-01', 'kw paid', { usersDaily: 9, surface: 'search_ad' }),
        hd('2026-09-01', 'kw rong', { usersDaily: null, posDaily: 5 }),
        hd('2026-09-01', 'kw that', { usersDaily: 1 }),
      ],
    }),
  );
  eq('chỉ còn term organic có số', r.terms.map((t) => t.keyword), ['kw that']);
}

console.log('\nNgày sau mốc thì không đoán');
{
  const r = M.buildOrganicDiscovery(
    payload({
      historyDaily: [
        hd('2026-09-10', 'kw', { usersDaily: 1 }),
        // Dòng lỗi ngày trong tương lai so với mốc: không có cửa sổ nào chứa nó.
        hd('2026-09-20', 'kw2', { usersDaily: 99 }),
      ],
    }),
  );
  // 09-20 thành mốc, nên kw (09-10) cách 10 ngày: ngoài L7, trong L30.
  eq('mốc theo ngày lớn nhất', r.asOf, '2026-09-20');
  const kw = r.terms.find((t) => t.keyword === 'kw');
  eq('kw không vào L7', kw.wins.l7, undefined);
  eq('kw vào L30', kw.wins.l30.users, 1);
}

console.log('\nSắp xếp + phát hiện tab bị cắt');
{
  const r = M.buildOrganicDiscovery(
    payload({
      allL30: Array.from({ length: 500 }, (_, i) => allRow(`paid-${i}`)),
      historyDaily: [
        hd('2026-09-01', 'it', { usersDaily: 1 }),
        hd('2026-09-01', 'nhieu', { usersDaily: 6 }),
      ],
    }),
  );
  eq('đuôi dày lên trước', r.terms.map((t) => t.keyword), ['nhieu', 'it']);
  eq('nêu tab dừng đúng ở giới hạn export', r.cappedTabs, [{ tab: 'All_L30', rows: 500 }]);
}

console.log('\nKhông có snapshot');
{
  eq('không có History nào ⇒ null', M.buildOrganicDiscovery(payload()), null);
  eq('không có data ⇒ null', M.buildOrganicDiscovery(null), null);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
