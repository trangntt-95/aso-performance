// Kiểm tra lib/market/keywordNetValue.ts — gộp net value về keyword và tính
// trần bid hoà vốn.
//
// Hai chỗ dễ sai, và cả hai đều làm lệch quyết định bid:
//
//   1. Gộp phải CỘNG rồi chia, không lấy trung bình các dòng. Trung bình cộng
//      cho một nước 1 install cùng trọng số với nước 60 install — mà đúng
//      những dòng 1 install mới là chỗ có $3.273/install làm lệch cả bảng.
//   2. Net value tính trên INSTALL, bid trả cho CLICK. Thiếu bước nhân CR là
//      so hai đơn vị khác nhau — đúng lỗi đã làm màn CPI cap báo 37/40 nước
//      "vượt trần" hồi tháng 8.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const M = await load('market/keywordNetValue.js');

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

const nv = (keyword, country, installs, payingShops, netValue, largestShopOrders = null) => ({
  surface: 'search',
  keyword,
  keywordDecoded: keyword,
  cluster: '',
  country,
  installs,
  payingShops,
  netValue,
  netPerInstall: installs > 0 ? netValue / installs : null,
  paidCrPct: null,
  largestShopOrders,
  shopsZeroOrders: null,
});

console.log('Gộp về keyword');
{
  const m = M.buildKeywordNetValue({
    netValuePerInstall: [
      nv('profit', 'United States', 60, 30, 6000, 13553),
      nv('profit', 'Japan', 1, 1, 3000, 7614),
      nv('true profit', 'United States', 10, 5, 1000),
    ],
  });
  const p = m.get('profit');
  eq('cộng installs', p.installs, 61);
  eq('cộng shop trả tiền', p.payingShops, 31);
  near('cộng net value', p.netValue, 9000);
  // 9000/61 = 147.5. Trung bình cộng hai dòng sẽ ra (100 + 3000)/2 = 1550 —
  // gấp hơn 10 lần, và đó là con số sẽ đi thẳng vào trần bid.
  near('cộng rồi chia, không lấy trung bình dòng', p.netPerInstall, 9000 / 61);
  eq('nước đóng nhiều tiền nhất', p.topCountry, 'United States');
  near('share của nước đó', p.topCountryShare, 6000 / 9000);
  eq('số nước', p.countries, 2);
  eq('lấy shop lớn nhất trong mọi dòng', p.largestShopOrders, 13553);
  eq('keyword khác vẫn riêng', m.get('true profit').installs, 10);
}

console.log('\nChuẩn hoá keyword khi ghép');
{
  const m = M.buildKeywordNetValue({
    netValuePerInstall: [nv('True  Profit', 'United States', 5, 5, 500)],
  });
  eq('hoa thường + khoảng trắng dư về cùng một key', m.get('true profit').installs, 5);
}

console.log('\nNgưỡng tin cậy đếm theo shop trả tiền');
{
  const m = M.buildKeywordNetValue({
    netValuePerInstall: [
      nv('day', 'United States', 100, 3, 5000),
      nv('mong', 'Japan', 1, 1, 3273, 7614),
      nv('nhieu-install-it-shop', 'United States', 80, 2, 4000),
    ],
  });
  eq('3 shop ⇒ đủ dày', m.get('day').thin, false);
  eq('1 shop ⇒ mỏng', m.get('mong').thin, true);
  // Đây là điểm của ngưỡng: 80 install trông rất dày, nhưng chỉ 2 shop trả
  // tiền thì net value vẫn do hai shop quyết định.
  eq('80 install nhưng 2 shop ⇒ vẫn mỏng', m.get('nhieu-install-it-shop').thin, true);
  eq('nói rõ vì sao mỏng', /shop trả tiền/.test(m.get('mong').thinReason), true);
}

console.log('\nKhông có install thì không bịa');
{
  const m = M.buildKeywordNetValue({
    netValuePerInstall: [nv('kw', 'Australia', 0, 0, 0)],
  });
  eq('0 install ⇒ net/install null', m.get('kw').netPerInstall, null);
}

console.log('\nTab rỗng');
{
  eq('không có dòng', M.buildKeywordNetValue({ netValuePerInstall: [] }).size, 0);
  eq('không có data', M.buildKeywordNetValue(null).size, 0);
}

console.log('\nTrần bid hoà vốn');
{
  // $100/install, CR 40% → 100 × 0.9 × 0.4 = $36
  near('net × 90% × CR', M.breakevenBid(100, 40), 36);
  eq('hệ số an toàn giữ đúng 90% của sheet', M.BID_SAFETY, 0.9);
  near('đổi được hệ số khi cần', M.breakevenBid(100, 40, 1), 40);
  // Thiếu một trong hai thì không đoán — trần bid sai làm mất tiền thật.
  eq('không có net/install ⇒ null', M.breakevenBid(null, 40), null);
  eq('không có CR ⇒ null', M.breakevenBid(100, null), null);
  eq('CR = 0 ⇒ null, không phải trần $0', M.breakevenBid(100, 0), null);
  eq('net/install âm ⇒ null', M.breakevenBid(-5, 40), null);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
