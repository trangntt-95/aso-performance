// Dựng body cho /api/ga4-daily/upload từ kết quả BigQuery (bước GA4 daily của
// pipeline): tab GA4_daily_auto (layout History_Daily) và GA4_daily_country_auto
// (layout History_Daily_Country).
//
// usage: node scripts/net-value/build-ga4-daily.mjs <daily.json> <country.json> <out-dir> [days=100]
//   daily.json   : {rows:[{date:'YYYYMMDD', surface, kw_raw, users, sessions, pos, installs}]}
//   country.json : {rows:[{date, country, surface, kw_raw, users, pos, installs}]}
//
// - kw_raw là surface_detail còn mã hoá URL ("presupuesto+gastado", "true%20profit") → giải mã, trim,
//   gộp chữ hoa/thường về một dòng (GA4 phân biệt "profit" và "PROFIT"; tab cũ không).
// - L7D = cộng 7 ngày kết thúc tại ngày đó (users, install); pos_L7D = trung bình pos theo users.
//   Xấp xỉ "users 7 ngày" của GA4 (GA4 đếm user duy nhất nên có thể thấp hơn tổng ngày một chút).
// - Chỉ giữ dòng có users > 0 hoặc install > 0; chỉ `days` ngày gần nhất để tab gọn.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [dailyFile, countryFile, outDir, daysArg] = process.argv.slice(2);
if (!outDir) { console.error('usage: build-ga4-daily.mjs <daily.json> <country.json> <out-dir> [days]'); process.exit(2); }
const keepDays = Number(daysArg) || 100;
const daily = JSON.parse(readFileSync(dailyFile, 'utf8')).rows ?? [];
const country = JSON.parse(readFileSync(countryFile, 'utf8')).rows ?? [];

const iso = (d) => (/^\d{8}$/.test(String(d)) ? `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}` : String(d).slice(0, 10));
const decode = (raw) => {
  let s = String(raw ?? '').replace(/\+/g, ' ');
  try { s = decodeURIComponent(s); } catch { /* giữ nguyên nếu mã hoá hỏng */ }
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
};
const surf = (s) => (s === 'search_ad' ? 'search_ad' : 'search');
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const r2 = (v) => (v === null ? '' : Math.round(v * 100) / 100);
const r4 = (v) => (v === null ? '' : Math.round(v * 10000) / 10000);

// --- gộp theo (date, surface, term) sau giải mã
const agg = new Map();
for (const r of daily) {
  const key = `${iso(r.date)}|${surf(r.surface)}|${decode(r.kw_raw)}`;
  const e = agg.get(key) ?? { date: iso(r.date), surface: surf(r.surface), term: decode(r.kw_raw), users: 0, installs: 0, posW: 0, posN: 0 };
  const u = Number(r.users) || 0;
  e.users += u;
  e.installs += Number(r.installs) || 0;
  const p = num(r.pos);
  if (p !== null && u > 0) { e.posW += p * u; e.posN += u; }
  agg.set(key, e);
}
const rows = Array.from(agg.values()).filter((e) => e.term && (e.users > 0 || e.installs > 0));
const dates = Array.from(new Set(rows.map((e) => e.date))).sort();
const lastDate = dates[dates.length - 1];
const cutoff = new Date(Date.parse(lastDate) - (keepDays - 1) * 86400000).toISOString().slice(0, 10);

// --- L7D theo (surface, term)
const byKey = new Map();
for (const e of rows) {
  const k = `${e.surface}|${e.term}`;
  const m = byKey.get(k) ?? new Map();
  m.set(e.date, e);
  byKey.set(k, m);
}
const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const out = [];
for (const e of rows) {
  if (e.date < cutoff) continue;
  const m = byKey.get(`${e.surface}|${e.term}`);
  let u7 = 0, i7 = 0, pw = 0, pn = 0;
  for (let k = 0; k < 7; k++) {
    const x = m.get(addDays(e.date, -k));
    if (!x) continue;
    u7 += x.users; i7 += x.installs; pw += x.posW; pn += x.posN;
  }
  const pos = e.posN > 0 ? e.posW / e.posN : null;
  const pos7 = pn > 0 ? pw / pn : null;
  out.push([
    e.date, e.term, e.surface,
    u7, i7, r4(u7 > 0 ? i7 / u7 : null), r2(pos7),
    e.users, e.installs, r4(e.users > 0 ? e.installs / e.users : null), r2(pos),
    'ga4_bq',
  ]);
}
out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1].localeCompare(b[1])));

// --- country
const aggC = new Map();
for (const r of country) {
  if (!r.country || r.country === '(not set)') continue;
  const key = `${iso(r.date)}|${r.country}|${surf(r.surface)}|${decode(r.kw_raw)}`;
  const e = aggC.get(key) ?? { date: iso(r.date), country: r.country, surface: surf(r.surface), term: decode(r.kw_raw), users: 0, installs: 0, posW: 0, posN: 0 };
  const u = Number(r.users) || 0;
  e.users += u;
  e.installs += Number(r.installs) || 0;
  const p = num(r.pos);
  if (p !== null && u > 0) { e.posW += p * u; e.posN += u; }
  aggC.set(key, e);
}
const outC = Array.from(aggC.values())
  .filter((e) => e.term && e.date >= cutoff && (e.users > 0 || e.installs > 0))
  .map((e) => [e.date, e.country, e.term, e.surface, e.users, e.installs, r4(e.users > 0 ? e.installs / e.users : null), r2(e.posN > 0 ? e.posW / e.posN : null), 'ga4_bq'])
  .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1].localeCompare(b[1]) || a[2].localeCompare(b[2])));

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'ga4-daily-body.json'), JSON.stringify({ tab: 'daily', rows: out }));
writeFileSync(join(outDir, 'ga4-daily-country-body.json'), JSON.stringify({ tab: 'country', rows: outC }));
const paid = out.filter((r) => r[2] === 'search_ad');
const sum = (a, i) => a.reduce((s, r) => s + (Number(r[i]) || 0), 0);
const sept = out.filter((r) => r[0] >= '2026-09-01');
console.log(JSON.stringify({
  from: cutoff, to: lastDate, rows: out.length, countryRows: outC.length, terms: byKey.size,
  paidRows: paid.length, usersTotal: sum(out, 7), installsTotal: sum(out, 8),
  septPaidInstalls: sum(sept.filter((r) => r[2] === 'search_ad'), 8), septOrganicInstalls: sum(sept.filter((r) => r[2] === 'search'), 8),
}));
