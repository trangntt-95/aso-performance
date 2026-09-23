// Dựng body cho /api/camp-links/upload: tab Camp_Links (Camp_URL) lấy làm chuẩn,
// đối chiếu với camp thật trên Shopify Ads qua Campaign ID (URL).
//
// usage: node scripts/master/build-camp-links.mjs <backup-camp-links.json> <geo.tsv> <out.json>
//   backup-camp-links.json : { rows } — tab Camp_Links hiện tại (GET /api/sheets/raw?tab=Camp_Links)
//   geo.tsv                : dump từ GraphQL Shopify (xem README): "#universe<TAB>codes" rồi mỗi camp
//                            "id<TAB>status<TAB>incl|excl<TAB>codes<TAB>tên hiện tại"; camp archived: "id<TAB>archived<TAB><TAB><TAB>tên"
//
// Quy tắc (Trang 23/09/2026: "lấy sheet camp_URL làm chuẩn; tên không khớp thì rà URL xem
// khớp camp nào hiện tại thì sửa"):
//   - Dòng có Campaign ID khớp camp Shopify → tên đổi theo tên hiện tại trên Shopify,
//     Geo điền từ targeting thật (include: liệt kê nước; loại trừ: "exclude: …").
//   - Dòng thiếu ID → tìm camp Shopify cùng tên (bỏ tag) → điền ID + URL.
//   - Camp Shopify (active/paused) chưa có dòng → thêm dòng mới, Category suy từ tên.
//   - Dòng trỏ camp đã archive → giữ, ghi chú "archived" (không xoá dữ liệu của Trang).
//   - Cột ghi chú F–H của Trang giữ nguyên; cột I "Tên cũ (alias)" gom mọi tên cũ của
//     cùng ID (cách nhau " | ") để export/Master/note mang tên cũ vẫn quy về camp; cột J ngày cập nhật.
import { readFileSync, writeFileSync } from 'node:fs';

const [backupFile, geoFile, outFile] = process.argv.slice(2);
if (!outFile) { console.error('usage: node build-camp-links.mjs <backup-camp-links.json> <geo.tsv> <out.json>'); process.exit(2); }
const rows = JSON.parse(readFileSync(backupFile, 'utf8')).rows;
const headerIdx = rows.findIndex((r) => String(r[0]).trim() === 'Category' && String(r[2]).trim() === 'Campaign ID');
if (headerIdx < 0) throw new Error('không thấy header Camp_Links');
const title = String(rows[0]?.[0] ?? 'TrueProfit — Camp → URL Master');
const data = rows.slice(headerIdx + 1).filter((r) => String(r[1] ?? '').trim());

// --- Shopify
const geoLines = readFileSync(geoFile, 'utf8').split(/\r?\n/).filter(Boolean);
const shop = new Map(); // id -> {status, mode, codes[], name}
for (const line of geoLines) {
  if (line.startsWith('#')) continue;
  const [id, status, mode, codes, ...rest] = line.split('\t');
  shop.set(id.trim(), { id: id.trim(), status, mode, codes: codes ? codes.split(',').filter(Boolean) : [], name: rest.join('\t').trim() });
}

// --- Tên nước tiếng Anh theo canon Country_L* (GA4)
const OVERRIDE = {
  HK: 'Hong Kong', MO: 'Macao', PS: 'Palestine', MM: 'Myanmar', TR: 'Türkiye', GB: 'United Kingdom', US: 'United States',
  KR: 'South Korea', CZ: 'Czechia', VN: 'Vietnam', RU: 'Russia', SY: 'Syria', LA: 'Laos', IR: 'Iran', BO: 'Bolivia',
  MD: 'Moldova', TZ: 'Tanzania', VE: 'Venezuela', VA: 'Vatican City', XK: 'Kosovo', CD: 'Congo - Kinshasa', CG: 'Congo - Brazzaville',
  CI: "Côte d'Ivoire", TW: 'Taiwan', KP: 'North Korea', BN: 'Brunei', FM: 'Micronesia', ST: 'São Tomé & Príncipe', SZ: 'Eswatini', UM: 'U.S. Outlying Islands',
};
const dn = new Intl.DisplayNames(['en'], { type: 'region' });
const nameOf = (code) => OVERRIDE[code] ?? (() => { try { return dn.of(code); } catch { return code; } })() ?? code;
const geoCell = (c) => {
  if (c.mode === 'incl') return c.codes.length ? c.codes.map(nameOf).join(', ') : '';
  if (c.codes.length === 0) return 'All countries/regions';
  return 'exclude: ' + c.codes.map(nameOf).join(', ');
};

// --- khớp tên (bỏ tag CPI, dấu chấm than, ghi chú sau " - ")
const loose = (n) => String(n ?? '').trim().replace(/^[!\s]+/, '').replace(/\s*\([^()]*CPI[^()]*\)/gi, ' ').replace(/\s*[-–]\s*CPI\s*[\d.]+\s*$/i, '')
  .toLowerCase().replace(/\s*[-–]\s*/g, ' - ').replace(/\s{2,}/g, ' ').trim();
const shopByLoose = new Map();
for (const c of shop.values()) { const k = loose(c.name); if (!shopByLoose.has(k)) shopByLoose.set(k, c); }
const findByName = (name) => {
  const k = loose(name);
  if (shopByLoose.has(k)) return shopByLoose.get(k);
  // tên Shopify dài hơn (thêm ghi chú) hoặc tên Camp_Links dài hơn
  let hit = null;
  for (const [sk, c] of shopByLoose) {
    if ((sk.startsWith(k) && /^\s*[-–(]/.test(sk.slice(k.length))) || (k.startsWith(sk) && /^\s*[-–(]/.test(k.slice(sk.length)))) {
      if (hit) return null; hit = c;
    }
  }
  return hit;
};

function categoryOf(name) {
  const n = name.toLowerCase();
  if (/brandname|brand name/.test(n)) return 'Brandname';
  if (/^tp\s*-\s*profit/.test(n)) return 'Profit';
  if (/competitor/.test(n)) return 'Competitor';
  if (/feature/.test(n)) return 'Feature';
  if (/cateogry|category/.test(n)) return 'Category';
  if (/language|app ?listing/.test(n)) return 'Language';
  if (/cpm/.test(n)) return 'CPM';
  return 'Others & Test';
}

const today = new Date().toISOString().slice(0, 10);
const url = (id) => `https://partners.shopify.com/832504/ads/${id}`;
const out = [];
const seenIds = new Set();
const stats = { kept: 0, renamed: 0, idFilled: 0, geoFilled: 0, archived: 0, added: 0, unmatched: 0 };
const log = [];
for (const r of data) {
  const row = Array.from({ length: 10 }, (_, i) => (r[i] === undefined || r[i] === null ? '' : String(r[i])));
  const aliases = new Set(row[8].split('|').map((x) => x.trim()).filter(Boolean));
  let id = row[2].trim();
  let c = id ? shop.get(id) : undefined;
  if (!id) {
    const hit = findByName(row[1]);
    if (hit) { id = hit.id; c = hit; row[2] = id; row[3] = url(id); stats.idFilled++; log.push(`ID điền: ${row[1]} → ${id}`); }
  }
  if (id) seenIds.add(id);
  if (c && c.status !== 'archived') {
    if (loose(c.name) !== loose(row[1])) { log.push(`đổi tên: "${row[1]}" → "${c.name}"`); aliases.add(row[1].trim()); row[1] = c.name; stats.renamed++; }
    const g = geoCell(c);
    if (g && g !== row[4].trim()) { row[4] = g; stats.geoFilled++; }
    if (!row[3].trim()) row[3] = url(id);
    row[9] = today;
    stats.kept++;
  } else if (c && c.status === 'archived') {
    row[5] = row[5].trim() ? row[5] : 'archived trên Shopify'; row[9] = today; stats.archived++;
  } else if (id) {
    row[5] = row[5].trim() ? row[5] : 'ID không còn trên Shopify (archived?)'; stats.unmatched++; log.push(`không thấy ID ${id}: ${row[1]}`);
  } else {
    stats.unmatched++; log.push(`không khớp camp nào: ${row[1]}`);
  }
  aliases.delete(row[1].trim());
  row[8] = Array.from(aliases).join(' | ');
  out.push(row);
}
for (const c of shop.values()) {
  if (c.status === 'archived' || seenIds.has(c.id)) continue;
  out.push([categoryOf(c.name), c.name, c.id, url(c.id), geoCell(c), `thêm ${today} từ Shopify Ads (${c.status})`, '', '', '', today]);
  stats.added++;
  log.push(`thêm: ${c.id} ${c.status} ${c.name}`);
}
writeFileSync(outFile, JSON.stringify({ title: `${title.replace(/ — cập nhật.*$/, '')} — cập nhật ${today} từ Shopify Ads (Campaign ID)`, rows: out }));
console.log(JSON.stringify({ ...stats, total: out.length }));
console.log(log.join('\n'));
