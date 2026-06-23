// One-off probe: why are some Language keywords not translated?
// 1) list all tab names, 2) dump _translation_cache schema + size,
// 3) count All_L7 Language rows with empty english, and how many of those
//    DO exist in _translation_cache (i.e. translation available but not shown).
import { google } from 'googleapis';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const env = Object.fromEntries(
  readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      let v = l.slice(i + 1);
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [l.slice(0, i), v];
    }),
);

const auth = new google.auth.JWT({
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });
const get = async (range) =>
  (await sheets.spreadsheets.values.get({ spreadsheetId: env.GOOGLE_SHEET_ID, range, valueRenderOption: 'UNFORMATTED_VALUE' })).data.values || [];

// 1) all tab names
const meta = await sheets.spreadsheets.get({ spreadsheetId: env.GOOGLE_SHEET_ID });
const tabNames = meta.data.sheets.map((s) => s.properties.title);
console.log('TABS:', tabNames.join(' | '));

// 2) _translation_cache
const cacheTab = tabNames.find((t) => /translation/i.test(t));
console.log('\n_translation_cache tab name =', cacheTab);
let cacheMap = new Map();
if (cacheTab) {
  const rows = await get(`'${cacheTab}'!A1:Z`);
  console.log('cache rows:', rows.length);
  console.log('header:', JSON.stringify(rows[0]));
  console.log('sample:', JSON.stringify(rows.slice(1, 6)));
  // schema: term | lang | english  → english is col index 2
  for (const r of rows.slice(1)) {
    const k = String(r?.[0] ?? '').trim().toLowerCase();
    const en = String(r?.[2] ?? '').trim();
    if (k) cacheMap.set(k, en);
  }
  const cacheEmpty = [...cacheMap.values()].filter((v) => !v).length;
  console.log(`cache entries: ${cacheMap.size}, with EMPTY english: ${cacheEmpty}`);
}

// Master-based language-only set (mirror lib/sheets/languageOverride.ts)
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const master = await get(`'Master KW Lookup'!A1:I`);
// header is 3 rows in; cols: Category(0) Camp(1) KW(2) ...
const catsByKw = new Map();
for (const r of master.slice(3)) {
  const kw = norm(r?.[2]);
  const cat = String(r?.[0] ?? '').trim();
  if (!kw || !cat) continue;
  if (!catsByKw.has(kw)) catsByKw.set(kw, new Set());
  catsByKw.get(kw).add(cat);
}
const languageOnly = new Set();
catsByKw.forEach((set, kw) => { if (set.size === 1 && set.has('Language')) languageOnly.add(kw); });
console.log(`\nMaster languageOnly kws: ${languageOnly.size}`);

// 3) Across ALL keyword tabs the app reads: which rows would the app render as
//    a non-English keyword (so a translation is EXPECTED) but have empty english?
const NON_ASCII = /[^\x00-\x7F]/;
let totalShown = 0, foreignRows = 0, emptyEn = 0, emptyButCacheHas = 0, emptyAndCacheEmpty = 0, emptyNotInCache = 0;
const fixable = [];
for (const tab of ['ALL_L7', 'ALL_L30', 'ALL_L90']) {
  const rows = (await get(`${tab}!A1:Z`)).slice(3);
  for (const r of rows) {
    const cat = String(r?.[0] ?? '').trim();
    const term = String(r?.[1] ?? '').trim();
    if (!term || term.toUpperCase() === 'TOTAL') continue;
    totalShown++;
    const lang = String(r?.[15] ?? '').trim();
    const english = String(r?.[16] ?? '').trim();
    // app would treat as non-English (translation expected):
    const appForeign =
      NON_ASCII.test(term) ||
      cat === 'Language' ||
      (lang && lang.toLowerCase() !== 'en') ||
      languageOnly.has(norm(term));
    if (!appForeign) continue;
    foreignRows++;
    if (english) continue;
    emptyEn++;
    const cv = cacheMap.get(norm(term));
    if (cv === undefined) { emptyNotInCache++; if (fixable.length < 0) {} }
    else if (cv) { emptyButCacheHas++; if (fixable.length < 20) fixable.push(`[${tab}] "${term}" → cache "${cv}"`); }
    else emptyAndCacheEmpty++;
  }
}
console.log(`\nScanned rows (L7+L30+L90): ${totalShown}`);
console.log(`  app-foreign rows (translation expected): ${foreignRows}`);
console.log(`  of those EMPTY english in row: ${emptyEn}`);
console.log(`    → cache HAS a translation (FIXABLE by loading cache): ${emptyButCacheHas}`);
console.log(`    → in cache but cache english also empty: ${emptyAndCacheEmpty}`);
console.log(`    → not in cache at all: ${emptyNotInCache}`);
console.log('\nFIXABLE examples (row empty, cache has translation):\n' + fixable.join('\n'));

// 4) The ?? short-circuit bug: per keyword, english only on SOME windows.
//    Build english-by-window and detect: L7 row exists with empty english but a
//    later window has a translation (?? chain would wrongly return '').
// Track per window: does the ROW exist (object present) and its english string
// (may be ''), to faithfully reproduce `row.l7?.english ?? row.l30?.english ...`.
const km = new Map(); // normKw -> {term, l7:{has,en}, l30, l90, l365}
const rec = (k, term, win, en) => {
  if (!km.has(k)) km.set(k, { term });
  km.get(k)[win] = { has: true, en };
};
async function load(tab, win, eIdx) {
  const rows = (await get(`${tab}!A1:Z`)).slice(3);
  for (const r of rows) {
    const term = String(r?.[1] ?? '').trim();
    if (!term || term.toUpperCase() === 'TOTAL') continue;
    rec(norm(term), term, win, String(r?.[eIdx] ?? '').trim());
  }
}
await load('ALL_L7', 'l7', 16);
await load('ALL_L30', 'l30', 16);
await load('ALL_L90', 'l90', 16);
await load('ALL_L365', 'l365', 9); // snapshot: english at index 9
// ?? chain: first window whose row exists supplies english (even '').
const chainEn = (o) => {
  for (const w of ['l7', 'l30', 'l90', 'l365']) if (o[w]?.has) return o[w].en;
  return '';
};
const anyEn = (o) => ['l7', 'l30', 'l90', 'l365'].map((w) => o[w]?.en).find((e) => e) || '';
let bugCount = 0; const bugEx = [];
km.forEach((o) => {
  const chain = chainEn(o);
  const any = anyEn(o);
  if (!chain && any) {
    bugCount++;
    if (bugEx.length < 25) bugEx.push(`"${o.term}" → would show '' but L-windows have "${any}"  [l7=${JSON.stringify(o.l7?.en)} l30=${JSON.stringify(o.l30?.en)} l90=${JSON.stringify(o.l90?.en)} l365=${JSON.stringify(o.l365?.en)}]`);
  }
});
console.log(`\n[?? short-circuit bug] keywords where Dictionary shows '' but another window HAS a translation: ${bugCount}`);
console.log(bugEx.join('\n'));

// 5) Translation EXISTS in the english column but the app HIDES it because
//    isNonEnglishKw is false (term is ASCII, not flagged Language, lang≈en).
//    display rule: show only if english && (nonAscii(term) || category==='Language')
//    where category is AFTER languageOnly override.
let hasTransl = 0, hiddenByGate = 0, shownOk = 0, sameAsKw = 0;
const hiddenEx = [];
for (const tab of ['ALL_L7', 'ALL_L30', 'ALL_L90']) {
  const rows = (await get(`${tab}!A1:Z`)).slice(3);
  for (const r of rows) {
    const rawcat = String(r?.[0] ?? '').trim();
    const term = String(r?.[1] ?? '').trim();
    if (!term || term.toUpperCase() === 'TOTAL') continue;
    const english = String(r?.[16] ?? '').trim();
    if (!english) continue;
    if (english.toLowerCase() === term.toLowerCase()) { sameAsKw++; continue; } // intentionally hidden (en==kw)
    hasTransl++;
    // app category after override:
    const cat = languageOnly.has(norm(term)) ? 'Language' : rawcat;
    const isNonEnglishKw = NON_ASCII.test(term) || cat === 'Language';
    if (isNonEnglishKw) shownOk++;
    else { hiddenByGate++; if (hiddenEx.length < 30) hiddenEx.push(`[${tab}] "${term}" (cat=${rawcat}) → EN "${english}" HIDDEN`); }
  }
}
console.log(`\n[gate suppression] rows with a real translation (en≠kw): ${hasTransl}`);
console.log(`  shown OK (app flags foreign): ${shownOk}`);
console.log(`  HIDDEN because app thinks it's English: ${hiddenByGate}`);
console.log(`  (en == kw, intentionally hidden): ${sameAsKw}`);
console.log('\nHIDDEN-but-translated examples:\n' + hiddenEx.join('\n'));
