// Tính lại tab 'Max bid cap' từ dữ liệu pipeline, giữ nguyên cấu trúc và các
// cột cấu hình của tab (Cat#, Ctry#, Country, Tier, Category, Cluster, Example,
// Tier Ceil, CR used). Chỉ đổi cột tiền:
//   NPI (cluster×ctry)  = YTD net value ÷ install của keyword thuộc Category đó
//                          ở nước đó (nv-final.json); ≥3 shop trả tiền mới tin;
//                          mỏng mà có ≥3 install → NPI category toàn cầu (*)
//   NPI×90%, Country NetVal×90% (net/install nước từ countries-body × 0.9),
//   Eff. Max CPI = min(hai cái trên), Bid Rec = min(Eff × CR used, Tier Ceil),
//   ⚠️ = bid > $45; không có NPI → để trống và ⛔ PAUSE như tab đang làm.
// usage: node build-npi.mjs <raw-maxbidcap.json> <nv-final.json> <countries-body.json> <payload.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [rawFile, nvFile, ctFile, payloadFile, outFile] = process.argv.slice(2);
if (!outFile) {
  console.error('usage: node build-npi.mjs <raw-maxbidcap.json> <nv-final.json> <countries-body.json> <payload.json> <out.json>');
  process.exit(2);
}
const raw = JSON.parse(readFileSync(rawFile, 'utf8'));
const rows = raw.rows ?? raw;
const nv = JSON.parse(readFileSync(nvFile, 'utf8'));
const ct = JSON.parse(readFileSync(ctFile, 'utf8'));
const payload = (() => { const d = JSON.parse(readFileSync(payloadFile, 'utf8')); return d.data ?? d; })();

const normKw = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const canon = (c) => (c === 'Turkey' ? 'Türkiye' : c === 'Czech Republic' ? 'Czechia' : String(c ?? '').trim());
const money = (s) => { const n = Number(String(s ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) && String(s).trim() !== '' ? n : null; };
const pct = (s) => { const n = money(s); return n === null ? null : n / 100; };

// 1. keyword → category: GA4 (đã qua override của dashboard), rồi cluster của tab Net value.
const catByKw = new Map();
for (const k of ['allL365', 'allL90', 'allL30', 'allL7']) for (const r of payload[k] ?? []) { const kw = normKw(r.searchTerm); if (kw && !catByKw.has(kw) && r.category) catByKw.set(kw, r.category); }
const clusterCat = (cl) => (/brand/i.test(cl) ? 'Brand' : /competitor/i.test(cl) ? 'Competitor' : /profit/i.test(cl) ? 'Profit' : /other|long tail/i.test(cl) ? 'Feature' : null);
// Category của tab Max bid cap chỉ có 5 nhóm; Others / CPM / Noise / Language của
// GA4 đều rơi vào cụm 'Test' (dropshipping, thanh toán, vận chuyển, theme…).
const TAB_CAT = { Brand: 'Brand', Profit: 'Profit', Competitor: 'Competitor', Feature: 'Feature', Others: 'Test', CPM: 'Test', Noise: 'Test', Language: 'Test' };
const catOfRow = (r) => TAB_CAT[catByKw.get(normKw(r.kw)) ?? clusterCat(r.cluster ?? '') ?? ''] ?? null;

// 2. Gộp theo nước × category, toàn cầu × category, và tổng theo nước.
const byCC = new Map(), byC = new Map(), byCountry = new Map();
const bump = (m, k, r) => { const e = m.get(k) ?? { inst: 0, pay: 0, net: 0 }; e.inst += r.inst; e.pay += r.pay; e.net += r.net; m.set(k, e); };
let unmapped = 0;
for (const r of nv) {
  const cat = catOfRow(r);
  if (!cat) { unmapped += r.inst; continue; }
  bump(byCC, `${canon(r.country)}|${cat}`, r);
  bump(byC, cat, r);
  bump(byCountry, canon(r.country), r);
}
// Quy tắc tái tạo đúng độ phủ của tab cũ (đo 17/09/2026: 183/193 ô active
// trùng): nước × category đủ 3 shop trả tiền → NPI riêng; không thì hễ nước có
// ít nhất một install (bất kỳ category) → NPI category toàn cầu (đánh dấu *);
// nước không có install nào → để trống, ⛔ PAUSE.
const MIN_PAYING = 3;
const npiOf = (country, cat) => {
  const e = byCC.get(`${country}|${cat}`);
  if (e && e.pay >= MIN_PAYING && e.inst > 0) return { npi: e.net / e.inst, src: 'ctry' };
  const g = byC.get(cat);
  const t = byCountry.get(country);
  if (t && t.inst >= 1 && g && g.pay >= MIN_PAYING && g.inst > 0) return { npi: g.net / g.inst, src: 'global' };
  return null;
};

// 3. Net/install theo nước (4 tháng gần nhất) × 90%.
const ctNet90 = new Map();
for (const r of ct.rows ?? []) if (r.installs >= 20 && r.net > 0) ctNet90.set(canon(r.country), (r.net / r.installs) * 0.9);

// 4. Đi qua từng dòng của tab.
const headerIdx = rows.findIndex((r) => (r[2] ?? '').toString().trim() === 'Country');
if (headerIdx < 0) { console.error('không thấy dòng tiêu đề'); process.exit(1); }
const data = rows.slice(headerIdx + 1).filter((r) => r[2] && r[4] && !/^Bid=/.test(String(r[0] ?? '')));
const fmt$ = (n, d = 0) => `$${n.toFixed(d)}`;
let active = 0, paused = 0, warn = 0, fromGlobal = 0, capBinding = 0;
const out = data.map((r) => {
  const row = Array.from({ length: 15 }, (_, i) => (r[i] ?? '').toString());
  const country = canon(row[2]), cat = row[4];
  const tierCeil = money(row[11]);
  const cr = pct(row[12]);
  // Không có CR used (cluster chưa có click ở nước này) → tab cũ để trống cả
  // NPI và Bid và đánh ⛔ PAUSE; giữ đúng hành vi đó.
  const got = cr === null ? null : npiOf(country, cat);
  if (!got) {
    paused++;
    row[7] = ''; row[8] = ''; row[9] = ''; row[10] = ''; row[13] = '';
    row[14] = '⛔ PAUSE';
    return row;
  }
  active++;
  if (got.src === 'global') fromGlobal++;
  const npi = got.npi, npi90 = npi * 0.9;
  const cn90 = ctNet90.get(country) ?? null;
  const eff = cn90 !== null ? Math.min(npi90, cn90) : npi90;
  if (cn90 !== null && cn90 < npi90) capBinding++;
  let bid = cr !== null ? eff * cr : null;
  if (bid !== null && tierCeil !== null) bid = Math.min(bid, tierCeil);
  row[7] = fmt$(npi, 0) + (got.src === 'global' ? '*' : '');
  row[8] = fmt$(npi90, 1);
  row[9] = cn90 !== null ? fmt$(cn90, 1) : '';
  row[10] = fmt$(eff, 1);
  row[13] = bid !== null ? fmt$(bid, 2) : '';
  row[14] = bid !== null && bid > 45 ? '⚠️' : '';
  if (row[14]) warn++;
  return row;
});

const today = new Date();
const dmy = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const yday = new Date(today.getTime() - 86400000);
const title = `TRUEPROFIT — MAX BID CAP  |  NPI Country×Category YTD 01/01/${yday.getFullYear()} → ${dmy(yday)} (net)  |  Country NetVal 4 tháng gần nhất  |  cập nhật ${dmy(today)}`;
const footer = Array.from({ length: 15 }, () => '');
footer[0] = `Bid=min(NPI×90%, Country NV×90%)×CR, chặn Tier Ceil | ${active} active | ${paused} paused | ${fromGlobal} dòng NPI* dùng category toàn cầu (nước mỏng) | ${capBinding} dòng NV nước chặn | ⚠️${warn} bids>$45 | ${unmapped} install không map được category`;
writeFileSync(outFile, JSON.stringify({ title, rows: [...out, footer] }));
console.log(`rows=${out.length} active=${active} paused=${paused} global=${fromGlobal} capBinding=${capBinding} warn=${warn} unmappedInstalls=${unmapped}`);
