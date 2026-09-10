// Kiểm tra sourcesBySheet — footer "Nguồn" ở chân mọi tab.
//
// Đáng test vì bảng ánh xạ 17 source → spreadsheet là do t gõ tay, và gõ sai
// một dòng thì footer gắn link sang spreadsheet không chứa tab đó: người đọc
// mở ra không thấy gì, mà không có gì báo là sai.
//
// Cái bẫy thật trong bảng này: 'Shopify_daily' (tổng theo camp) là TAB trong
// sheet ASO, còn 'Shopify Ads (per-day)' mới nằm ở spreadsheet Shopify Ads.
// Hai tên gần giống nhau, hai spreadsheet khác nhau.
//
// Chạy từ gốc repo:
//   node apps-script/test/source-footer.test.mjs
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { sourcesBySheet } = await load('market/dataGaps.js');

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

console.log('Nhóm theo spreadsheet');
{
  const g = sourcesBySheet(['bidCap', 'shopifyDaily', 'googleAds']);
  eq('ba spreadsheet, thứ tự aso → shopify → gads', g.map((x) => x.sheet), ['aso', 'shopify', 'gads']);
  eq('tab của sheet ASO', g[0].labels, ['Max bid cap']);
  eq('export theo ngày ở spreadsheet Shopify Ads', g[1].labels, ['Shopify Ads (per-day)']);
  eq('Google Ads riêng một spreadsheet', g[2].labels, ['Google Ads']);
}

console.log('\nShopify_daily là tab của sheet ASO, không phải sheet Shopify');
{
  const g = sourcesBySheet(['shopifyCamps']);
  eq('chỉ một nhóm', g.length, 1);
  eq('thuộc sheet ASO', g[0].sheet, 'aso');
  eq('tên tab', g[0].labels, ['Shopify_daily']);
}

console.log('\nGiữ thứ tự khai báo, bỏ trùng nhãn');
{
  const g = sourcesBySheet(['campLinks', 'masterKwLookup', 'bidCap']);
  eq('đúng thứ tự trang khai', g[0].labels, ['Camp_Links', 'Master KW Lookup', 'Max bid cap']);
  // Ba block của tab này là ba source khác nhau, nhãn cũng khác nhau,
  // nên vẫn kể ba — trùng chỉ bị gộp khi nhãn giống hệt.
  const p = sourcesBySheet(['perGeoCpiCap', 'perGeoRevenue', 'marketTiers']);
  eq('ba block của Countries performance kể riêng', p[0].labels, [
    'Countries performance',
    'Countries performance (block doanh thu)',
    'Countries performance (block tier)',
  ]);
  eq('khai trùng key thì chỉ kể một lần',
    sourcesBySheet(['bidCap', 'bidCap'])[0].labels, ['Max bid cap']);
}

console.log('\nĐầu vào rỗng / lạ');
{
  eq('rỗng ⇒ không nhóm nào', sourcesBySheet([]), []);
  // Key lạ bị bỏ qua thay vì làm sập footer — trang có thể khai key cũ sau khi
  // registry đổi tên, và một footer thiếu một dòng vẫn tốt hơn một trang trắng.
  eq('key không có trong registry bị bỏ qua',
    sourcesBySheet(['bidCap', 'khongCoThat']).map((x) => x.labels), [['Max bid cap']]);
}

console.log('\nMọi tab family đều thuộc sheet ASO');
{
  const g = sourcesBySheet(['allTabs', 'countryTabs', 'historyDaily', 'history', 'marketIndex']);
  eq('một nhóm duy nhất', g.length, 1);
  eq('sheet ASO', g[0].sheet, 'aso');
  eq('kể đủ 5 nhãn', g[0].labels.length, 5);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
