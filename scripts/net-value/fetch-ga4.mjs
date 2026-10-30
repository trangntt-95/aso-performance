// Kéo GA4 gốc theo ngày TRỰC TIẾP từ GA4 Data API bằng service account (không qua
// MCP / BigQuery), rồi gom thành đúng định dạng mà build-ga4-daily.mjs và
// build-ga4-windows.mjs đang nhận từ SQL bước 14 của pipeline:
//   daily.json   : {rows:[{date:'YYYYMMDD', surface, kw_raw, users, sessions, pos, installs}]}
//   country.json : {rows:[{date, country, surface, kw_raw, users, pos, installs}]}
//
// usage: node scripts/net-value/fetch-ga4.mjs <out-dir> [days=370] [endDate=yesterday YYYY-MM-DD]
// env  : GOOGLE_SERVICE_ACCOUNT_KEY (JSON của key, hoặc base64 của JSON)
//        hoặc GOOGLE_APPLICATION_CREDENTIALS (đường dẫn file key)
//        GA4_PROPERTY_ID (mặc định 348654457 = TrueProfit)
//
// Service account phải được cấp Viewer trên GA4 property, và GCP project của SA phải bật
// "Google Analytics Data API". Chạy trên GitHub Actions hằng ngày (xem .github/workflows).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { google } from 'googleapis';

const [outDir, daysArg, endArg] = process.argv.slice(2);
if (!outDir) { console.error('usage: fetch-ga4.mjs <out-dir> [days] [endDate]'); process.exit(2); }
const days = Number(daysArg) || 370;
const propertyId = process.env.GA4_PROPERTY_ID || '348654457';

const iso = (d) => d.toISOString().slice(0, 10);
const endDate = endArg || iso(new Date(Date.now() - 86400000));
const startDate = iso(new Date(Date.parse(endDate) - (days - 1) * 86400000));

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw && raw.trim()) {
    const s = raw.trim();
    const txt = s.startsWith('{') ? s : Buffer.from(s, 'base64').toString('utf8');
    const j = JSON.parse(txt);
    if (typeof j.private_key === 'string') j.private_key = j.private_key.replace(/\\n/g, '\n');
    return j;
  }
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (p) return JSON.parse(readFileSync(p, 'utf8'));
  throw new Error('thiếu GOOGLE_SERVICE_ACCOUNT_KEY hoặc GOOGLE_APPLICATION_CREDENTIALS');
}

const auth = new google.auth.GoogleAuth({
  credentials: credentials(),
  scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
});
const ga = google.analyticsdata({ version: 'v1beta', auth });

const LP = 'landingPagePlusQueryString';
const searchFilter = { filter: { fieldName: LP, stringFilter: { matchType: 'CONTAINS', value: 'surface_type=search' } } };
const installFilter = {
  andGroup: { expressions: [
    { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'shopify_app_install' } } },
    searchFilter,
  ] },
};

async function runReport(dimensions, metrics, dimensionFilter, label) {
  const PAGE = 100000;
  let offset = 0;
  const rows = [];
  for (;;) {
    const res = await ga.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        dimensionFilter,
        limit: PAGE,
        offset,
        returnPropertyQuota: true,
      },
    });
    const data = res.data;
    const got = data.rows ?? [];
    for (const r of got) {
      const o = {};
      dimensions.forEach((d, i) => { o[d] = r.dimensionValues[i].value; });
      metrics.forEach((m, i) => { o[m] = Number(r.metricValues[i].value) || 0; });
      rows.push(o);
    }
    offset += got.length;
    const total = data.rowCount ?? 0;
    if (got.length === 0 || offset >= total) {
      const q = data.propertyQuota;
      console.error(`${label}: ${rows.length}/${total} rows` + (q ? ` | quota tokens/day còn ${q.tokensPerDay?.remaining}` : ''));
      return rows;
    }
  }
}

const param = (lp, key) => {
  const m = String(lp).match(new RegExp(`[?&]${key}=([^&]+)`));
  return m ? m[1] : null;
};

// Gom theo (date[, country], surface, kw_raw): users/sessions cộng dồn, pos trung bình theo users,
// installs từ report riêng (eventCount của shopify_app_install).
function aggregate(userRows, installRows, withCountry) {
  const key = (r, s, k) => (withCountry ? `${r.date}|${r.country}|${s}|${k}` : `${r.date}|${s}|${k}`);
  const acc = new Map();
  const base = (r, s, k) => ({ date: r.date, ...(withCountry ? { country: r.country } : {}), surface: s, kw_raw: k, users: 0, sessions: 0, posW: 0, posN: 0, installs: 0 });
  for (const r of userRows) {
    const lp = r[LP];
    const s = param(lp, 'surface_type');
    const k = param(lp, 'surface_detail');
    if (!s || !k || (s !== 'search' && s !== 'search_ad')) continue;
    const e = acc.get(key(r, s, k)) ?? base(r, s, k);
    const u = r.totalUsers || 0;
    e.users += u;
    e.sessions += r.sessions || 0;
    const p = Number(param(lp, 'surface_intra_position'));
    if (Number.isFinite(p) && p > 0 && u > 0) { e.posW += p * u; e.posN += u; }
    acc.set(key(r, s, k), e);
  }
  for (const r of installRows) {
    const lp = r[LP];
    const s = param(lp, 'surface_type');
    const k = param(lp, 'surface_detail');
    if (!s || !k || (s !== 'search' && s !== 'search_ad')) continue;
    const e = acc.get(key(r, s, k)) ?? base(r, s, k);
    e.installs += r.eventCount || 0;
    acc.set(key(r, s, k), e);
  }
  return Array.from(acc.values())
    .map((e) => ({
      date: e.date,
      ...(withCountry ? { country: e.country } : {}),
      surface: e.surface,
      kw_raw: e.kw_raw,
      users: e.users,
      ...(withCountry ? {} : { sessions: e.sessions }),
      pos: e.posN > 0 ? Math.round((e.posW / e.posN) * 10000) / 10000 : null,
      installs: e.installs,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.surface.localeCompare(b.surface) || a.kw_raw.localeCompare(b.kw_raw));
}

mkdirSync(outDir, { recursive: true });
console.error(`GA4 ${propertyId} ${startDate} → ${endDate}`);
const [lp, inst, lpC, instC] = [
  await runReport(['date', LP], ['totalUsers', 'sessions'], searchFilter, 'users'),
  await runReport(['date', LP], ['eventCount'], installFilter, 'installs'),
  await runReport(['date', 'country', LP], ['totalUsers'], searchFilter, 'users×country'),
  await runReport(['date', 'country', LP], ['eventCount'], installFilter, 'installs×country'),
];
const daily = aggregate(lp, inst, false);
const country = aggregate(lpC, instC, true);
writeFileSync(join(outDir, 'ga4-daily.json'), JSON.stringify({ rows: daily }));
writeFileSync(join(outDir, 'ga4-daily-country.json'), JSON.stringify({ rows: country }));
const sum = (rows, f) => rows.reduce((a, r) => a + (r[f] || 0), 0);
console.log(JSON.stringify({ startDate, endDate, daily: daily.length, country: country.length, users: sum(daily, 'users'), installs: sum(daily, 'installs'), lastDate: daily.at(-1)?.date }));
