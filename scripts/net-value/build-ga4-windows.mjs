// Dựng các tab cửa sổ GA4 (thay All_L3/7/14/30/90, Country_L3/7/14/30/90, All_L365,
// Country_L365 của Apps Script) từ GA4 gốc theo ngày đã kéo về BigQuery.
//
// usage: node scripts/net-value/build-ga4-windows.mjs <daily.json> <country.json> <payload.json> <out.json>
//   daily.json / country.json : kết quả hai SQL bước 14 (date YYYYMMDD, surface, kw_raw, users, sessions, pos, installs[, country])
//   payload.json              : /api/sheets hiện tại — lấy từ điển term → Category / Lang / English của tab cũ
//                               và Master keyword → category, để cột phân loại không mất khi bỏ Apps Script.
//
// Layout y hệt tab cũ (dòng 1 tiêu đề có 2 cặp ngày, dòng 2 header, dòng 3 TOTAL, dữ liệu từ dòng 4)
// nên parseKeywordTab / parseSnapshot / parseWindowDateRange đọc như cũ. Số ghi dạng số thật
// (CR, Δ% là phân số 0–1) — valueInputOption RAW.
//
// Khác Apps Script: KHÔNG cắt 500 dòng (All_L90 cũ mất 95 install vì cắt), users là tổng users
// theo ngày (xấp xỉ user duy nhất của GA4, có thể cao hơn vài %).
import { readFileSync, writeFileSync } from 'node:fs';

const [dailyFile, countryFile, payloadFile, outFile] = process.argv.slice(2);
if (!outFile) { console.error('usage: build-ga4-windows.mjs <daily.json> <country.json> <payload.json> <out.json>'); process.exit(2); }
const daily = JSON.parse(readFileSync(dailyFile, 'utf8')).rows ?? [];
const country = JSON.parse(readFileSync(countryFile, 'utf8')).rows ?? [];
const payload = JSON.parse(readFileSync(payloadFile, 'utf8'));
const P = payload.data ?? payload;

const iso = (d) => (/^\d{8}$/.test(String(d)) ? `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}` : String(d).slice(0, 10));
const decode = (raw) => {
  let s = String(raw ?? '').replace(/\+/g, ' ');
  try { s = decodeURIComponent(s); } catch { /* giữ nguyên */ }
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
};
const surf = (s) => (s === 'search_ad' ? 'search_ad' : 'search');
const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

// ---- từ điển phân loại từ tab cũ + Master
const dict = new Map(); // term → {category, lang, english}
for (const tab of ['allL365', 'allL90', 'allL30', 'allL14', 'allL7', 'allL3', 'countryL90', 'countryL30', 'countryL14', 'countryL7', 'countryL3']) {
  for (const r of P[tab] ?? []) {
    const k = String(r.searchTerm ?? '').trim().toLowerCase();
    if (!k) continue;
    const cur = dict.get(k);
    if (!cur) dict.set(k, { category: r.category, lang: r.lang ?? '', english: r.english ?? '' });
    else { if (!cur.english && r.english) cur.english = r.english; if (!cur.lang && r.lang) cur.lang = r.lang; }
  }
}
const MASTER_CAT = { brandname: 'Brand', brand: 'Brand', profit: 'Profit', competitor: 'Competitor', feature: 'Feature', category: 'Category', language: 'Language', cpm: 'CPM', noise: 'Noise', others: 'Others', 'others & test': 'Others', test: 'Test' };
const master = new Map();
for (const m of P.masterKwLookup ?? []) {
  const k = String(m.keyword ?? '').trim().toLowerCase();
  if (k && !master.has(k)) master.set(k, MASTER_CAT[String(m.category ?? '').trim().toLowerCase()] ?? 'Others');
}
const BRAND = /^(true ?profits?|tru ?profit|trueprofit[a-z]*|true ?pro|true ?prof|true ?profi|trueprof|truepro|truprofit|ture ?profit)$/;
const classify = (term) => {
  const d = dict.get(term);
  if (d?.category && d.category !== 'Unknown') return d.category;
  if (master.has(term)) return master.get(term);
  if (BRAND.test(term)) return 'Brand';
  if (/[^\x00-\x7F]/.test(term)) return 'Language';
  if (/\bprofit/.test(term)) return 'Profit';
  return 'Others';
};
const langOf = (term) => dict.get(term)?.lang || (/[^\x00-\x7F]/.test(term) ? '' : 'en');
const englishOf = (term) => dict.get(term)?.english || '';

// ---- gộp theo ngày
const D = new Map(); // key date|surface|term → {users, installs, posW, posN}
for (const r of daily) {
  const term = decode(r.kw_raw); if (!term) continue;
  const key = `${iso(r.date)}|${surf(r.surface)}|${term}`;
  const e = D.get(key) ?? { date: iso(r.date), surface: surf(r.surface), term, users: 0, installs: 0, posW: 0, posN: 0 };
  const u = Number(r.users) || 0; e.users += u; e.installs += Number(r.installs) || 0;
  const p = r.pos === null || r.pos === undefined ? null : Number(r.pos);
  if (p !== null && Number.isFinite(p) && u > 0) { e.posW += p * u; e.posN += u; }
  D.set(key, e);
}
const C = new Map(); // key date|country|surface|term
for (const r of country) {
  if (!r.country || r.country === '(not set)') continue;
  const term = decode(r.kw_raw); if (!term) continue;
  const key = `${iso(r.date)}|${r.country}|${surf(r.surface)}|${term}`;
  const e = C.get(key) ?? { date: iso(r.date), country: r.country, surface: surf(r.surface), term, users: 0, installs: 0, posW: 0, posN: 0 };
  const u = Number(r.users) || 0; e.users += u; e.installs += Number(r.installs) || 0;
  const p = r.pos === null || r.pos === undefined ? null : Number(r.pos);
  if (p !== null && Number.isFinite(p) && u > 0) { e.posW += p * u; e.posN += u; }
  C.set(key, e);
}
const allDates = Array.from(new Set(Array.from(D.values()).map((e) => e.date))).sort();
const end = allDates[allDates.length - 1];

function aggregate(rows, from, to, withCountry) {
  const out = new Map();
  for (const e of rows) {
    if (e.date < from || e.date > to) continue;
    const key = withCountry ? `${e.country}|${e.surface}|${e.term}` : `${e.surface}|${e.term}`;
    const a = out.get(key) ?? { country: e.country, surface: e.surface, term: e.term, users: 0, installs: 0, posW: 0, posN: 0 };
    a.users += e.users; a.installs += e.installs; a.posW += e.posW; a.posN += e.posN;
    out.set(key, a);
  }
  return out;
}
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
const pos = (a) => (a && a.posN > 0 ? r2(a.posW / a.posN) : '');
const cr = (a) => (a && a.users > 0 ? r4(a.installs / a.users) : '');
const pct = (cur, prev) => (typeof prev === 'number' && prev > 0 && typeof cur === 'number' ? r4((cur - prev) / prev) : '');

function alertOf(uL, uP, iL, iP, cL, cP, pL, pP) {
  const posWorse = typeof pL === 'number' && typeof pP === 'number' && pL >= pP * 1.5 && pL - pP >= 1;
  const posBetter = typeof pL === 'number' && typeof pP === 'number' && pL <= pP * 0.7 && pP - pL >= 0.5;
  const userDrop = uP >= 5 && uL <= uP * 0.5;
  const userGrow = uP >= 5 && uL >= uP * 2;
  if (userDrop && posWorse) return '🚨 USER DROP + POS WORSEN';
  if (posWorse && uP >= 5) return '⚠️ POSITION WORSEN';
  if (iP >= 3 && iL <= iP * 0.5) return '💔 INSTALL DROP';
  if (typeof cL === 'number' && typeof cP === 'number' && uP >= 10 && uL >= 10 && cL <= cP * 0.5) return '💸 CR DROP';
  if (userDrop) return '📉 USER DROP';
  if (userGrow && posBetter) return '🌱 user growth + pos improve';
  if (posBetter && uL >= 5) return '📈 pos improve';
  if (iP >= 2 && iL >= iP * 2) return '❤️ install up';
  if (typeof cL === 'number' && typeof cP === 'number' && uP >= 10 && uL >= 10 && cL >= cP * 1.5) return '💚 cr improve';
  if (userGrow) return '🚀 user growth';
  return 'OK';
}

const tabs = [];
const dailyRows = Array.from(D.values());
const countryRows = Array.from(C.values());
for (const W of [3, 7, 14, 30, 90]) {
  const to = end, from = addDays(end, -(W - 1)), pTo = addDays(from, -1), pFrom = addDays(from, -W);
  for (const [prefix, rows, withCountry] of [['All', dailyRows, false], ['Country', countryRows, true]]) {
    const cur = aggregate(rows, from, to, withCountry);
    const prev = aggregate(rows, pFrom, pTo, withCountry);
    const keys = new Set([...cur.keys(), ...prev.keys()]);
    const data = [];
    let tU = 0, tUP = 0, tI = 0, tIP = 0;
    for (const k of keys) {
      const a = cur.get(k), b = prev.get(k);
      if (!a && !b) continue;
      const base = a ?? b;
      const uL = a?.users ?? 0, uP = b?.users ?? 0, iL = a?.installs ?? 0, iP = b?.installs ?? 0;
      if (uL === 0 && iL === 0 && uP === 0 && iP === 0) continue;
      const cL = cr(a), cP = cr(b), pL = pos(a), pP = pos(b);
      tU += uL; tUP += uP; tI += iL; tIP += iP;
      const row = [classify(base.term), base.term];
      if (withCountry) row.push(base.country);
      row.push(base.surface, uL, uP, iL, iP, cL, cP, pL, pP, pct(pL, pP), pct(uL, uP), pct(cL, cP), alertOf(uL, uP, iL, iP, cL, cP, pL, pP), langOf(base.term), englishOf(base.term));
      data.push(row);
    }
    data.sort((x, y) => (y[withCountry ? 4 : 3] - x[withCountry ? 4 : 3]) || (y[withCountry ? 6 : 5] - x[withCountry ? 6 : 5]));
    const name = `GA4_${prefix}_L${W}_auto`;
    const header = withCountry
      ? ['Category', 'Search Term', 'Country', 'Surface Type', `Users L${W}D`, `Users P${W}D`, `Install L${W}D`, `Install P${W}D`, `CR L${W}D`, `CR P${W}D`, `Pos L${W}D`, `Pos P${W}D`, 'Δ Pos %', 'Δ Users %', 'Δ CR %', 'ALERT', 'Lang', 'English meaning']
      : ['Category', 'Search Term', 'Surface Type', `Users L${W}D`, `Users P${W}D`, `Install L${W}D`, `Install P${W}D`, `CR L${W}D`, `CR P${W}D`, `Pos L${W}D`, `Pos P${W}D`, 'Δ Pos %', 'Δ Users %', 'Δ CR %', 'ALERT', 'Lang', 'English meaning'];
    const total = withCountry
      ? ['TOTAL', `(${data.length} rows)`, '(all countries)', '(all surfaces)', tU, tUP, tI, tIP, tU ? r4(tI / tU) : '', tUP ? r4(tIP / tUP) : '']
      : ['TOTAL', `(${data.length} rows)`, '(all surfaces)', tU, tUP, tI, tIP, tU ? r4(tI / tU) : '', tUP ? r4(tIP / tUP) : ''];
    tabs.push({ name, title: `${name} — L${W}D: ${from} → ${to} vs P${W}D: ${pFrom} → ${pTo} · GA4 gốc qua BigQuery, không cắt dòng`, header, total, rows: data });
  }
}
// L365 snapshot
{
  const to = end, from = addDays(end, -364);
  for (const [prefix, rows, withCountry] of [['All', dailyRows, false], ['Country', countryRows, true]]) {
    const cur = aggregate(rows, from, to, withCountry);
    const totalUsers = Array.from(cur.values()).reduce((s, a) => s + a.users, 0);
    const data = [];
    let tI = 0;
    for (const a of cur.values()) {
      if (a.users === 0 && a.installs === 0) continue;
      tI += a.installs;
      const row = [classify(a.term), a.term];
      if (withCountry) row.push(a.country);
      row.push(a.surface, a.users, a.installs, cr(a), pos(a), totalUsers ? r4(a.users / totalUsers) : '', langOf(a.term), englishOf(a.term));
      data.push(row);
    }
    data.sort((x, y) => y[withCountry ? 4 : 3] - x[withCountry ? 4 : 3]);
    const name = `GA4_${prefix}_L365_auto`;
    const header = withCountry
      ? ['Category', 'Search Term', 'Country', 'Surface Type', 'Users L365D', 'Install L365D', 'CR L365D', 'Pos avg L365D', '% Share', 'Lang', 'English meaning']
      : ['Category', 'Search Term', 'Surface Type', 'Users L365D', 'Install L365D', 'CR L365D', 'Pos avg L365D', '% Share', 'Lang', 'English meaning'];
    const total = withCountry ? ['TOTAL', `(${data.length} rows)`, '(all countries)', '(all surfaces)', totalUsers, tI] : ['TOTAL', `(${data.length} rows)`, '(all surfaces)', totalUsers, tI];
    tabs.push({ name, title: `${name} — Snapshot L365D: ${from} → ${to} (no comparison) · GA4 gốc qua BigQuery`, header, total, rows: data });
  }
}
writeFileSync(outFile, JSON.stringify({ tabs }));
console.log(JSON.stringify({ end, tabs: tabs.map((t) => ({ name: t.name, rows: t.rows.length, users: t.total[t.header.indexOf(t.header.find((h) => /^Users L/.test(h)))], installs: t.total[t.header.indexOf(t.header.find((h) => /^Install L/.test(h)))] })) }));
const unknownCat = new Set(); for (const t of tabs) for (const r of t.rows) if (r[0] === 'Others' && !dict.has(r[1]) && !master.has(r[1])) unknownCat.add(r[1]);
console.log('term mới không có trong từ điển/Master (xếp Others):', unknownCat.size);
