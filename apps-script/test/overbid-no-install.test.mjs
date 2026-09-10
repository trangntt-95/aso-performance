// Kiểm tra luật mới của Overbid: tiêu quá ngưỡng mà không ra install nào.
//
// Vì sao cần luật riêng: hai chiều cũ đều là TỶ LỆ — CPC so bid cho phép, CPI
// so CPI cho phép. Camp 0 install thì CPI không tồn tại (chia cho 0), nên nó
// lọt qua cả hai và hiện 'ok'. Camp tệ nhất có thể có — tiêu hết tiền, không
// đổi lấy gì — lại là camp bảng báo bình thường.
//
// Chỗ dễ sai: camp 0 install thường cũng ít click, nên nếu chấm sau cửa
// 'low-clicks' thì nó thoát ra bằng cửa đó và luật mới không bao giờ chạy.
import { buildAndLoad } from './build.mjs';

const load = buildAndLoad();
const { assessCamps, findOverbidCamps } = await load('market/overbid.js');

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

const camp = (camp, spend, installs, clicks, impressions = 1000) => ({
  camp, spend, installs, clicks, impressions,
});
const bidRow = (country, category, bid, npi) => ({
  tier: 'Tier 1 Premium',
  country,
  countryCode: '',
  category,
  keywordCluster: 'C1',
  exampleKeywords: '',
  instL90: 0,
  clicksL30: 0,
  installsL30: 0,
  crActual: 0,
  cpiCap: 0,
  tierCeiling: 100,
  bidRecommended: bid,
  actionRecommended: '',
  netValue: npi,
  netValuePrev: null,
  netValueCurr: null,
  capAt90: npi === null ? null : npi * 0.9,
  crUsedPct: 50,
  crSource: '',
  warning: '',
});
const CAPS = [bidRow('United States', 'Profit', 10, 50)];

console.log('Tiêu nhiều, 0 install');
{
  const rows = assessCamps([camp('TP - Profit - A', 45, 0, 3)], CAPS, [], [], {});
  const r = rows[0];
  // 3 click là dưới ngưỡng low-clicks mặc định (5) — luật tiền vẫn phải thắng.
  eq('bị chấm overbid dù ít click', r.verdict, 'overbid');
  eq('nói rõ lý do', r.reasons, ['Tiêu $45.00, chưa ra install nào']);
  eq('xếp hạng theo tiền đã đốt', r.score, 45);
  eq('vẫn giữ số liệu gốc', [r.spend, r.installs, r.clicks], [45, 0, 3]);
  eq('không có CPI để so', r.cpi, null);
}

console.log('\nDưới ngưỡng thì không báo');
{
  const rows = assessCamps([camp('TP - Profit - B', 29.99, 0, 3)], CAPS, [], [], {});
  // $29,99 chưa tới $30 — và ít click nên rơi về low-clicks như cũ.
  eq('29,99 chưa đủ ngưỡng', rows[0].verdict, 'low-clicks');
}
{
  const rows = assessCamps([camp('TP - Profit - C', 30, 0, 3)], CAPS, [], [], {});
  eq('đúng $30 là đủ (>=)', rows[0].verdict, 'overbid');
}

console.log('\nCó install thì luật này không đụng tới');
{
  const rows = assessCamps([camp('TP - Profit - D', 100, 4, 20)], CAPS, [], [], {});
  // CPI $25 dưới trần NPI×90% = $45 → không overbid.
  eq('có install ⇒ chấm theo luật tỷ lệ như cũ', rows[0].verdict, 'ok');
  eq('không dán lý do 0 install', rows[0].reasons, []);
}

console.log('\nĐổi được ngưỡng');
{
  const rows = assessCamps([camp('TP - Profit - E', 45, 0, 3)], CAPS, [], [], { noInstallSpend: 100 });
  eq('nâng ngưỡng lên $100 thì $45 không báo', rows[0].verdict, 'low-clicks');
}

console.log('\nCamp đã tắt vẫn không báo');
{
  const paused = [{ category: '', camp: 'TP - Profit - F', keyword: '', bidMax: '' }];
  const rows = assessCamps([camp('TP - Profit - F', 500, 0, 2)], CAPS, [], paused, {});
  // Camp đã tắt thì không sửa bid được nữa — báo chỉ làm nhiễu danh sách.
  eq('camp paused không bị chấm overbid', rows[0].verdict, 'paused');
}

console.log('\n6 click mà chưa ra install');
{
  // 6 click, 0 install, mới tiêu $12 — dưới ngưỡng tiền nhưng vẫn phải báo:
  // CR chắc chắn dưới 1/6 ≈ 16,7%. Camp bid thấp ăn được hàng chục click mà
  // chưa tới $30, và vẫn là camp đang hỏng.
  const rows = assessCamps([camp('TP - Profit - I', 12, 0, 6)], CAPS, [], [], {});
  eq('6 click 0 install ⇒ overbid', rows[0].verdict, 'overbid');
  eq('lý do nói cả CR trần', rows[0].reasons, ['6 click, chưa ra install nào (CR < 16.7%)']);
}
{
  // 5 click: chưa tới ngưỡng 6 của luật mới, nhưng ĐÃ tới minClicks (5) nên nó
  // vẫn được chấm bình thường — CPC $2,40 dưới bid cho phép $10 ⇒ 'ok'.
  const rows = assessCamps([camp('TP - Profit - J', 12, 0, 5)], CAPS, [], [], {});
  eq('5 click chưa đủ cho luật mới, vẫn chấm như cũ', rows[0].verdict, 'ok');
}
{
  // Dưới cả minClicks thì vẫn là low-clicks — luật mới không nới cửa đó ra.
  const rows = assessCamps([camp('TP - Profit - J2', 12, 0, 4)], CAPS, [], [], {});
  eq('4 click ⇒ low-clicks', rows[0].verdict, 'low-clicks');
}
{
  const rows = assessCamps([camp('TP - Profit - K', 12, 1, 20)], CAPS, [], [], {});
  eq('có install thì luật click không đụng tới',
    rows[0].reasons.some((x) => /click, chưa/.test(x)), false);
}
{
  // Vừa quá tiền vừa quá click ⇒ kể cả hai lý do, không chọn một.
  const rows = assessCamps([camp('TP - Profit - L', 80, 0, 10)], CAPS, [], [], {});
  eq('hai lý do cùng hiện', rows[0].reasons.length, 2);
  eq('CR trần tính theo số click thật', /CR < 10\.0%/.test(rows[0].reasons[1]), true);
}
{
  // Nâng ngưỡng lên 20 thì 6 click không còn bị bắt; nó rơi về đường chấm cũ
  // (6 ≥ minClicks nên vẫn được chấm) và CPC $2 dưới bid cho phép ⇒ 'ok'.
  const rows = assessCamps([camp('TP - Profit - M', 12, 0, 6)], CAPS, [], [], { noInstallClicks: 20 });
  eq('đổi được ngưỡng click', rows[0].verdict, 'ok');
}

console.log('\nVào danh sách overbid');
{
  const list = findOverbidCamps(
    [camp('TP - Profit - G', 60, 0, 2), camp('TP - Profit - H', 10, 0, 2)],
    CAPS, [], [], {},
  );
  eq('chỉ camp vượt ngưỡng', list.map((r) => r.camp), ['TP - Profit - G']);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
