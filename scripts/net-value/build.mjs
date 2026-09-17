// Từ kết quả BigQuery (JSON của MCP run_query, dạng {rows:[...]} hoặc mảng) và
// payload dashboard hiện tại (để lấy cluster), dựng nv-final.json cho push.mjs.
// usage: node scripts/net-value/build.mjs <bq-result.json> <out.json> [sheets-payload.json]
import { readFileSync, writeFileSync } from 'node:fs';

const [inFile, outFile, payloadFile] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error('usage: node build.mjs <bq-result.json> <out.json> [sheets-payload.json]');
  process.exit(2);
}
const raw = readFileSync(inFile, 'utf8');
const parsed = JSON.parse(raw.slice(raw.indexOf(raw.trimStart()[0] === '[' ? '[' : '{')));
const rows = Array.isArray(parsed) ? parsed : parsed.rows;
if (!Array.isArray(rows) || rows.length < 50) {
  console.error('kết quả BigQuery quá ít dòng:', rows?.length);
  process.exit(1);
}

const dec = (s) => {
  let t = String(s ?? '').replace(/\+/g, ' ');
  try { t = decodeURIComponent(t); } catch { /* giữ nguyên */ }
  return t.trim();
};
const canon = (c) => (c === 'Turkey' ? 'Türkiye' : c === 'Czech Republic' ? 'Czechia' : c || '(unknown)');

const cluster = new Map();
if (payloadFile) {
  try {
    const d = JSON.parse(readFileSync(payloadFile, 'utf8'));
    const p = d.data ?? d;
    for (const r of p.netValuePerInstall ?? []) {
      const k = (r.keywordDecoded || r.keyword).toLowerCase().trim();
      if (r.cluster && !cluster.has(k)) cluster.set(k, r.cluster);
    }
  } catch (e) {
    console.error('không đọc được payload cluster, bỏ qua:', e.message);
  }
}

const out = rows
  .map((r) => {
    const kw = dec(r.kw_raw);
    const inst = Number(r.installs), pay = Number(r.paying_shops), net = Number(r.net_value);
    return {
      surface: r.surface, kwRaw: r.kw_raw, kw, cluster: cluster.get(kw.toLowerCase()) ?? '', country: canon(r.country),
      inst, pay, net, npi: inst ? net / inst : null, cr: inst ? pay / inst : null,
      largest: Number(r.largest_shop_orders30 ?? 0), zero: Number(r.shops_zero_orders30 ?? 0),
    };
  })
  .filter((r) => r.kw && (r.surface === 'search' || r.surface === 'search_ad'))
  .sort((a, b) => b.net - a.net);

writeFileSync(outFile, JSON.stringify(out));
const sum = (f) => out.reduce((s, r) => s + r[f], 0);
console.log(`rows=${out.length} installs=${sum('inst')} paying=${sum('pay')} net=${Math.round(sum('net'))} cluster=${out.filter((r) => r.cluster).length}`);
