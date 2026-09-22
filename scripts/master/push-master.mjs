// Đẩy body từ build-master.mjs vào tab Master KW Lookup / Paused_camp qua /api/master/upload.
// usage: node scripts/master/push-master.mjs <master-body.json> [<paused-body.json>]
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) { console.error('usage: node push-master.mjs <master-body.json> [<paused-body.json>]'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const tokenFile = join(here, '..', 'net-value', '.token');
const token = (process.env.NET_VALUE_UPLOAD_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8') : '')).trim();
if (!token) { console.error('thiếu token (scripts/net-value/.token hoặc NET_VALUE_UPLOAD_TOKEN)'); process.exit(2); }
const base = process.env.DASHBOARD_URL ?? 'https://appstore-performance.vercel.app';
let failed = false;
for (const file of files) {
  const body = JSON.parse(readFileSync(file, 'utf8'));
  const res = await fetch(`${base}/api/master/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-upload-token': token },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(file, res.status, text);
  if (!res.ok) failed = true;
}
if (failed) process.exit(1);
