import { google } from 'googleapis';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const env = Object.fromEntries(
  readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('='); let v = l.slice(i + 1); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i), v];
  }),
);
const auth = new google.auth.JWT({ email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const sheets = google.sheets({ version: 'v4', auth });
const get = async (r) => (await sheets.spreadsheets.values.get({ spreadsheetId: env.GOOGLE_SHEET_ID, range: r, valueRenderOption: 'UNFORMATTED_VALUE' })).data.values || [];

// --- copied normalizers from lib/sheets/campGeo.ts (include-mode subset) ---
const VN_TO_EN = { 'đức': 'Germany', 'pháp': 'France', 'tây ban nha': 'Spain', 'hoa kỳ': 'United States', 'mỹ': 'United States', 'ấn độ': 'India', 'việt nam': 'Vietnam', 'hà lan': 'Netherlands', 'vương quốc anh': 'United Kingdom', 'anh': 'United Kingdom', 'thổ nhĩ kỳ': 'Türkiye', 'thụy sĩ': 'Switzerland', 'ba lan': 'Poland', 'bồ đào nha': 'Portugal', 'na uy': 'Norway', 'thụy điển': 'Sweden', 'hy lạp': 'Greece', 'litva': 'Lithuania', 'các tiểu vương quốc ả rập thống nhất': 'United Arab Emirates', 'phần lan': 'Finland', 'bỉ': 'Belgium', 'áo': 'Austria', 'đan mạch': 'Denmark', 'síp': 'Cyprus', 'trung quốc': 'China', 'hàn quốc': 'South Korea', 'đài loan': 'Taiwan', 'ukraina': 'Ukraine', 'séc': 'Czechia', 'nhật bản': 'Japan', 'nga': 'Russia', 'ý': 'Italy', 'úc': 'Australia', 'canada': 'Canada', 'australia': 'Australia' };
const CODE_TO_EN = { IN: 'India', PK: 'Pakistan', VN: 'Vietnam', US: 'United States', UK: 'United Kingdom', GB: 'United Kingdom', DE: 'Germany', FR: 'France', ES: 'Spain', SE: 'Sweden', AU: 'Australia', NL: 'Netherlands', CA: 'Canada', TR: 'Türkiye', CH: 'Switzerland', PT: 'Portugal', NO: 'Norway', PL: 'Poland', NZ: 'New Zealand', FI: 'Finland', IT: 'Italy', BE: 'Belgium', HK: 'Hong Kong', JP: 'Japan', BL: 'Bangladesh' };
const EN_ALIASES = { turkey: 'Türkiye', czech: 'Czechia', 'czech republic': 'Czechia', uae: 'United Arab Emirates', usa: 'United States', korea: 'South Korea' };
const normTok = (raw) => { const t = String(raw).replace(/["“”]/g, '').trim(); if (!t) return null; const l = t.toLowerCase(); if (VN_TO_EN[l]) return VN_TO_EN[l]; if (EN_ALIASES[l]) return EN_ALIASES[l]; if (/^[A-Za-z]{2}$/.test(t) && CODE_TO_EN[t.toUpperCase()]) return CODE_TO_EN[t.toUpperCase()]; return t; };
const splitTok = (s) => s.split(/[,\n\r]+/).map(normTok).filter(Boolean);
function parseGeo(g0) { const g = String(g0 ?? '').trim(); if (!g) return { mode: 'unknown', countries: [] }; const l = g.toLowerCase(); if (l.includes('all countries') || /^\d+\s+countries/.test(l)) return { mode: 'all', countries: [] }; if (l.startsWith('exclude')) return { mode: 'exclude', countries: splitTok(g.replace(/^exclude:?/i, '')) }; if (g.startsWith('-')) return { mode: 'exclude', countries: splitTok(g.replace(/^-\s*/, '')) }; return { mode: 'include', countries: splitTok(g) }; }
const CAT_MAP = { brandname: ['Brand'], brand: ['Brand'], profit: ['Profit'], competitor: ['Competitor'], cpm: ['CPM'], feature: ['Feature'], language: ['Language'], lang: ['Language'], others: ['Others'], test: ['Test'], 'others & test': ['Others', 'Test'] };
function campCats(cat, camp) { const fc = CAT_MAP[String(cat).trim().toLowerCase()]; if (fc) return fc; const m = String(camp).match(/TP\s*-\s*([A-Za-z& ]+?)\s*-/i); if (m) { const mm = CAT_MAP[m[1].trim().toLowerCase()]; if (mm) return mm; } return []; }

// bidCap: category -> country -> bid (Bid Rec ⭐ is the LAST col). Need col indices.
const bc = await get(`'Max bid cap'!A1:Z`);
const hdr = bc[0]; const ci = hdr.indexOf('Category'); const coi = hdr.indexOf('Country');
const bidIdx = hdr.findIndex((h) => /bid rec/i.test(String(h)));
console.log('bidcap cols: category', ci, 'country', coi, 'bidRec', bidIdx, '=>', JSON.stringify(hdr[bidIdx]));
const map = new Map();
for (const r of bc.slice(1)) { const cat = String(r?.[ci] ?? '').trim(); const co = String(r?.[coi] ?? '').trim(); const bid = Number(r?.[bidIdx]); if (!cat || !co || !(bid > 0)) continue; if (!map.has(cat)) map.set(cat, new Map()); map.get(cat).set(co, bid); }

const cl = await get(`'Camp_Links'!A1:E`);
let h = -1; for (let i = 0; i < 10; i++) if (String(cl[i]?.[0] ?? '').trim() === 'Category' && String(cl[i]?.[2] ?? '').trim() === 'Campaign ID') { h = i; break; }
const data = cl.slice(h + 1).filter((r) => String(r?.[1] ?? '').trim());
const seen = new Set(); const out = []; const near = [];
let nInclude = 0, nWith2 = 0;
for (const r of data) {
  const camp = String(r[1]).trim(); if (seen.has(camp)) continue; seen.add(camp);
  const geo = parseGeo(r[4]); if (geo.mode !== 'include' || geo.countries.length < 2) continue;
  nInclude++;
  const cat = campCats(r[0], camp)[0]; if (!cat) continue; const bm = map.get(cat); if (!bm) continue;
  const per = geo.countries.map((c) => ({ c, b: bm.get(c) })).filter((x) => typeof x.b === 'number');
  const unresolved = geo.countries.filter((c) => !bm.has(c));
  if (per.length < 2) { near.push(`SKIP <2 resolved: [${cat}] ${camp} | geoCountries=${geo.countries.join(',')} | unresolved=${unresolved.join(',')}`); continue; }
  nWith2++;
  const bids = per.map((x) => x.b); const mn = Math.min(...bids), mx = Math.max(...bids);
  const spread = (mx - mn) / mn;
  if (spread < 0.05 || mx - mn < 0.25) { near.push(`below-thresh ${Math.round(spread*100)}%: [${cat}] ${camp} | ${per.map(p=>`${p.c} $${p.b.toFixed(2)}`).join(' · ')}`); continue; }
  out.push({ camp, cat, spread, mn, mx, per });
}
console.log(`include-mode multi-country camps: ${nInclude}, with >=2 resolved-bid countries: ${nWith2}`);
console.log('\nNEAR/SKIP:'); near.forEach((n) => console.log('  ' + n));
out.sort((a, b) => b.spread - a.spread);
console.log(`\nCONFLICTS: ${out.length}\n`);
for (const c of out.slice(0, 20)) console.log(`${Math.round(c.spread * 100)}%  [${c.cat}] ${c.camp}\n     ${c.per.map((p) => `${p.c} $${p.b.toFixed(2)}`).join(' · ')}`);
