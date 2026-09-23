// Đẩy body từ build-ga4-windows.mjs (12 tab) vào sheet qua /api/ga4-windows/upload.
// usage: node scripts/net-value/push-ga4-windows.mjs <ga4-windows-body.json>
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [file] = process.argv.slice(2);
if (!file) { console.error('usage: node push-ga4-windows.mjs <ga4-windows-body.json>'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const tokenFile = join(here, '.token');
const token = (process.env.NET_VALUE_UPLOAD_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8') : '')).trim();
if (!token) { console.error('thiếu token'); process.exit(2); }
const base = process.env.DASHBOARD_URL ?? 'https://appstore-performance.vercel.app';
const body = JSON.parse(readFileSync(file, 'utf8'));
// Gửi từng nhóm 4 tab để body không quá lớn.
let failed = false;
for (let i = 0; i < body.tabs.length; i += 4) {
  const chunk = { tabs: body.tabs.slice(i, i + 4) };
  const res = await fetch(`${base}/api/ga4-windows/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-upload-token': token },
    body: JSON.stringify(chunk),
  });
  console.log(chunk.tabs.map((t) => t.name).join(','), res.status, (await res.text()).slice(0, 300));
  if (!res.ok) failed = true;
}
if (failed) process.exit(1);
