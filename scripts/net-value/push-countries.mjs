// Đẩy body countries (từ build-countries.mjs) vào tab Countries_performance_auto.
// usage: node scripts/net-value/push-countries.mjs <countries-body.json>
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [file] = process.argv.slice(2);
if (!file) {
  console.error('usage: node push-countries.mjs <countries-body.json>');
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
const body = JSON.parse(readFileSync(file, 'utf8'));
body.note = `Nguồn: BigQuery trueda.trueprofit — install = RELATIONSHIP_INSTALLED/REACTIVATED trong kỳ (loại testing_shops), nước = shops.CountryName, doanh thu = partner_transactions từ lúc cài tới hôm nay (gross và net), first paid = có AppSubscriptionSale > 0 sau khi cài. Ghi ${new Date().toISOString()} bằng Claude Code.`;
const res = await fetch(`${base}/api/countries/upload`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-upload-token': token },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
