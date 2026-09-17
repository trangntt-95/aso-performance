// Đẩy body từ build-npi.mjs vào tab 'Max bid cap' qua /api/bidcap/upload.
// usage: node scripts/net-value/push-bidcap.mjs <bidcap-body.json>
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [file] = process.argv.slice(2);
if (!file) { console.error('usage: node push-bidcap.mjs <bidcap-body.json>'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const tokenFile = join(here, '.token');
const token = (process.env.NET_VALUE_UPLOAD_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8') : '')).trim();
if (!token) { console.error('thiếu token'); process.exit(2); }
const base = process.env.DASHBOARD_URL ?? 'https://appstore-performance.vercel.app';
const body = JSON.parse(readFileSync(file, 'utf8'));
const res = await fetch(`${base}/api/bidcap/upload`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-upload-token': token },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
