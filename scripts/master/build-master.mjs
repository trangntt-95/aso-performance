// Dựng body cho /api/master/upload từ keyword thật của Shopify App Store Ads.
//
// usage: node scripts/master/build-master.mjs <kws.json> <camp-links.json> <old-master.json> <old-paused.json> <out-dir>
//   kws.json        : { [campaignId]: { id, name, status, kws: [[keyword, matchType, bid, status, relevance, impr, clicks, installs, spend], ...] } }
//                     — dump từ GraphQL nội bộ partners.shopify.com (đọc qua Chrome đăng nhập của Trang)
//   camp-links.json : mảng CampLinkRow (từ /api/sheets → campLinks) để lấy Category theo camp
//   old-master.json : { rows: string[][] } tab Master KW Lookup cũ (giữ cột Classification theo keyword)
//   old-paused.json : { rows: string[][] } tab Paused_camp cũ (Classification)
// Ghi: <out-dir>/master-body.json và <out-dir>/paused-body.json
//
// Quy tắc:
//   - Camp status active  → Master KW Lookup; paused/khác → Paused_camp.
//   - Mọi keyword của camp đều ghi, kèm cột "KW status" (active/paused) để Trang
//     thấy keyword tắt; parser dashboard chỉ đọc 5 cột đầu nên keyword tắt vẫn bị
//     coi là đang bid — vì thế keyword status ≠ active ghi Bid (max) rỗng → hiện "—".
//   - Category: Camp_Links theo tên camp (khớp lỏng); không có → tên camp
//     ("TP - Profit - …" → Profit, "Brandname" → Brandname, "Languages" → Language,
//     "Competitor", "Feature", "Cateogry/Category" → Category, "CPM", "[dd.mm] Test" → Others & Test).
//   - Classification: chép từ tab cũ theo keyword chuẩn hoá (giữ NOISE/POTENTIAL Trang gán tay).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [kwsFile, linksFile, oldMasterFile, oldPausedFile, outDir] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node build-master.mjs <kws.json> <camp-links.json> <old-master.json> <old-paused.json> <out-dir>');
  process.exit(2);
}
const kws = JSON.parse(readFileSync(kwsFile, 'utf8'));
const links = JSON.parse(readFileSync(linksFile, 'utf8'));
const oldMaster = JSON.parse(readFileSync(oldMasterFile, 'utf8')).rows ?? [];
const oldPaused = JSON.parse(readFileSync(oldPausedFile, 'utf8')).rows ?? [];

const normKw = (s) => String(s ?? '').toLowerCase().replace(/[\[\]"]/g, '').replace(/\s+/g, ' ').trim();
const loose = (n) => String(n ?? '').trim().replace(/^[!\s]+/, '').replace(/\s*\([^()]*CPI[^()]*\)/gi, ' ').replace(/\s*[-–]\s*CPI\s*[\d.]+\s*$/i, '')
  .toLowerCase().replace(/\s*[-–]\s*/g, ' - ').replace(/\s{2,}/g, ' ').trim();

// Classification cũ theo keyword (ưu tiên Master, rồi Paused).
const classOf = new Map();
for (const rows of [oldPaused, oldMaster]) {
  let header = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) if (rows[i]?.[0] === 'Category' && rows[i]?.[2] === 'KW') header = i;
  if (header < 0) continue;
  for (const r of rows.slice(header + 1)) {
    const k = normKw(r[2]);
    const c = String(r[8] ?? '').trim();
    if (k && c) classOf.set(k, c);
  }
}

// Category theo camp: Camp_Links (khớp lỏng, cả tiền tố), rồi tên camp.
const linkCat = new Map();
for (const l of links) if (l.camp && l.category) linkCat.set(loose(l.camp), l.category.trim());
const linkKeys = Array.from(linkCat.keys()).sort((a, b) => b.length - a.length);
const idCat = new Map();
for (const l of links) if (l.campaignId && l.category) idCat.set(String(l.campaignId).trim(), l.category.trim());
function categoryOf(id, name) {
  if (idCat.has(String(id))) return idCat.get(String(id));
  const k = loose(name);
  if (linkCat.has(k)) return linkCat.get(k);
  for (const base of linkKeys) if (k.startsWith(base) && /^\s*[-–(]/.test(k.slice(base.length))) return linkCat.get(base);
  const n = name.toLowerCase();
  if (/brandname|brand name/.test(n)) return 'Brandname';
  if (/profit/.test(n) && /^tp\s*-/.test(n)) return 'Profit';
  if (/competitor/.test(n)) return 'Competitor';
  if (/feature/.test(n)) return 'Feature';
  if (/cateogry|category/.test(n)) return 'Category';
  if (/language|app listing|applisting/.test(n)) return 'Language';
  if (/cpm/.test(n)) return 'CPM';
  if (/generic/.test(n)) return 'Others';
  return 'Others & Test';
}

const today = new Date().toISOString().slice(0, 10);
const money = (n) => (typeof n === 'number' && n > 0 ? `$${n.toFixed(2)}` : '');
const master = [];
const paused = [];
const stats = { camps: 0, active: 0, pausedCamps: 0, kwActive: 0, kwPaused: 0, classKept: 0 };
for (const c of Object.values(kws)) {
  stats.camps++;
  const isActive = c.status === 'active';
  if (isActive) stats.active++; else stats.pausedCamps++;
  const cat = categoryOf(c.id, c.name);
  const name = String(c.name).trim();
  const rows = (c.kws ?? []).map((k) => {
    const [keyword, match, bid, status, , impr, clicks, installs] = k;
    const kwActive = status === 'active';
    if (kwActive) stats.kwActive++; else stats.kwPaused++;
    const cls = classOf.get(normKw(keyword)) ?? '';
    if (cls) stats.classKept++;
    return [cat, name, String(keyword).trim(), match, kwActive ? money(bid) : '', impr ?? 0, clicks ?? 0, installs ?? 0, cls, status, String(c.id), today, '', 'Shopify Ads GraphQL'];
  });
  rows.sort((a, b) => a[2].localeCompare(b[2]));
  (isActive ? master : paused).push(...rows);
}
master.sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]));
paused.sort((a, b) => a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));

mkdirSync(outDir, { recursive: true });
const note = `Use: tìm KW đã bid chưa | bid ở camp nào | bid bao nhiêu. Sort A→Z by KW. Tự động từ Shopify Ads (GraphQL) ${today} — ${stats.active} camp đang chạy, ${stats.kwActive} keyword active, ${stats.kwPaused} keyword tắt (Bid rỗng). Impressions/Clicks/Installs = 90 ngày gần nhất. Classification chép từ bản cũ theo keyword. KHÔNG sửa tay — chạy lại pipeline khi cần.`;
writeFileSync(join(outDir, 'master-body.json'), JSON.stringify({
  tab: 'master',
  title: `TrueProfit — Master KW Lookup (All Categories, sorted A→Z by KW) — cập nhật ${today}`,
  note,
  rows: master,
}));
writeFileSync(join(outDir, 'paused-body.json'), JSON.stringify({
  tab: 'paused',
  title: `TrueProfit — Paused_camp (camp đã tắt / lưu trữ trên Shopify Ads) — cập nhật ${today}`,
  note: `Keyword của camp status ≠ active trên Shopify Ads, dump ${today}. ${stats.pausedCamps} camp. Cùng layout Master KW Lookup.`,
  rows: paused,
  minRows: 1,
}));
console.log(JSON.stringify({ ...stats, masterRows: master.length, pausedRows: paused.length }));
