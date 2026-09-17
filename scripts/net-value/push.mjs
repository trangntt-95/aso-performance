// Đẩy nv-final.json vào tab 'Net value per install' qua /api/net-value/upload.
// Token: env NET_VALUE_UPLOAD_TOKEN, hoặc file scripts/net-value/.token (gitignored).
// usage: node scripts/net-value/push.mjs <nv-final.json> <toLabel dd/mm/yyyy>
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [file, toLabel] = process.argv.slice(2);
if (!file || !toLabel) {
  console.error('usage: node push.mjs <nv-final.json> <toLabel dd/mm/yyyy>');
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const tokenFile = join(here, '.token');
const token = (process.env.NET_VALUE_UPLOAD_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8') : '')).trim();
if (!token) {
  console.error('thiếu token: đặt NET_VALUE_UPLOAD_TOKEN hoặc tạo scripts/net-value/.token');
  process.exit(2);
}
const base = process.env.DASHBOARD_URL ?? 'https://appstore-performance.vercel.app';
const out = JSON.parse(readFileSync(file, 'utf8'));
const rows = out.map((r) => ({
  surface: r.surface, keyword: r.kwRaw, keywordDecoded: r.kw, cluster: r.cluster, country: r.country,
  installs: r.inst, payingShops: r.pay, netValue: r.net, netPerInstall: r.npi, paidCrPct: r.cr,
  largestShopOrders: r.largest, shopsZeroOrders: r.zero,
}));
const scope = `Keyword x country — YTD 2026 (01/01/2026 → ${toLabel}) · BigQuery + GA4, cập nhật hằng ngày qua Claude Code`;
const note = `Nguồn: BigQuery trueda.trueprofit (shops.CountryName, partner_transactions net_amount từ 01/01/2026, shop_insights 30 ngày, loại testing_shops) × GA4 shopify_app_install theo keyword. Ghi ${new Date().toISOString()}. Install tháng gần nhất cohort chưa chín — $/install thấp hơn thật.`;
const res = await fetch(`${base}/api/net-value/upload`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-upload-token': token },
  body: JSON.stringify({ scope, rows, note }),
});
const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
