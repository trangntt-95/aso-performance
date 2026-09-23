// Đẩy body từ build-camp-links.mjs vào tab Camp_Links qua /api/camp-links/upload.
// usage: node scripts/master/push-camp-links.mjs <camp-links-body.json>
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [file] = process.argv.slice(2);
if (!file) { console.error('usage: node push-camp-links.mjs <camp-links-body.json>'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const tokenFile = join(here, '..', 'net-value', '.token');
const token = (process.env.NET_VALUE_UPLOAD_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8') : '')).trim();
if (!token) { console.error('thiếu token'); process.exit(2); }
const base = process.env.DASHBOARD_URL ?? 'https://appstore-performance.vercel.app';
const res = await fetch(`${base}/api/camp-links/upload`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-upload-token': token },
  body: JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))),
});
console.log(res.status, await res.text());
if (!res.ok) process.exit(1);
