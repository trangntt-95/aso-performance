// Từ kết quả BigQuery theo nước (JSON {rows:[...]} hoặc mảng) dựng body cho
// push-countries.mjs: chuẩn tên nước, bỏ (unknown), tính kỳ từ win_from/win_to.
// usage: node scripts/net-value/build-countries.mjs <bq-countries.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error('usage: node build-countries.mjs <bq-countries.json> <out.json>');
  process.exit(2);
}
const raw = readFileSync(inFile, 'utf8');
const trimmed = raw.trimStart();
const parsed = JSON.parse(raw.slice(raw.indexOf(trimmed[0] === '[' ? '[' : '{')));
const rows = Array.isArray(parsed) ? parsed : parsed.rows;
if (!Array.isArray(rows) || rows.length < 20) {
  console.error('kết quả BigQuery quá ít nước:', rows?.length);
  process.exit(1);
}
const canon = (c) => (c === 'Turkey' ? 'Türkiye' : c === 'Czech Republic' ? 'Czechia' : c);
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const from = rows[0].win_from, to = rows[0].win_to;
if (!from || !to) {
  console.error('thiếu win_from/win_to trong kết quả');
  process.exit(1);
}
const m = (iso) => Number(iso.slice(5, 7));
const period = `Doanh thu theo nước — 4 tháng gần nhất đã kết thúc: ${dmy(from)} → ${dmy(to)} (tháng ${m(from)}-${m(to)}/${to.slice(0, 4)}) · install trong kỳ, doanh thu gross tính từ lúc cài tới hôm nay · BigQuery, cập nhật hằng ngày`;
const out = rows
  .filter((r) => r.country && r.country !== '(unknown)')
  .map((r) => ({ country: canon(r.country), installs: Number(r.installs), firstPaid: Number(r.first_paid), gross: Number(r.gross), net: Number(r.net) }));
writeFileSync(outFile, JSON.stringify({ period, rows: out }));
const sum = (f) => out.reduce((s, r) => s + r[f], 0);
console.log(`countries=${out.length} installs=${sum('installs')} firstPaid=${sum('firstPaid')} gross=${Math.round(sum('gross'))} net=${Math.round(sum('net'))} period=${from}→${to}`);
