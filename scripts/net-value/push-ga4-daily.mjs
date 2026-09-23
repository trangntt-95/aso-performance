// Đẩy body từ build-ga4-daily.mjs vào tab GA4_daily_auto / GA4_daily_country_auto qua /api/ga4-daily/upload.
// usage: node scripts/net-value/push-ga4-daily.mjs <ga4-daily-body.json> [<ga4-daily-country-body.json>]
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) { console.error('usage: node push-ga4-daily.mjs <body.json> [<body2.json>]'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const tokenFile = join(here, '.token');
const token = (process.env.NET_VALUE_UPLOAD_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8') : '')).trim();
if (!token) { console.error('thiếu token'); process.exit(2); }
const base = process.env.DASHBOARD_URL ?? 'https://appstore-performance.vercel.app';
let failed = false;
for (const file of files) {
  const res = await fetch(`${base}/api/ga4-daily/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-upload-token': token },
    body: readFileSync(file, 'utf8'),
  });
  console.log(file, res.status, await res.text());
  if (!res.ok) failed = true;
}
if (failed) process.exit(1);
