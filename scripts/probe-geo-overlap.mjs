// One-off probe: (1) overlap between Master KW Lookup camps and Paused_camp camps,
// (2) distinct Geo values in Camp_Links, (3) distinct country names in Country_L7.
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

const campSet = (rows) => {
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (String(rows[i]?.[0] ?? '').trim() === 'Category' && String(rows[i]?.[2] ?? '').trim() === 'KW') { h = i; break; }
  }
  const s = new Set();
  for (const r of rows.slice(h + 1)) {
    const c = String(r?.[1] ?? '').trim();
    if (c) s.add(c);
  }
  return s;
};

const masterCamps = campSet(await get(`'Master KW Lookup'!A1:I`));
const pausedRows = await get(`'Paused_camp'!A1:I`);
const pausedCamps = campSet(pausedRows);
console.log(`Master camps: ${masterCamps.size}, Paused camps: ${pausedCamps.size}, paused kw rows: ${pausedRows.length - 2}`);
const overlap = [...pausedCamps].filter((c) => masterCamps.has(c));
console.log(`\n=== Camps in BOTH Master and Paused_camp (${overlap.length}) ===`);
overlap.forEach((c) => console.log('  ' + c));

const campLinks = await get(`'Camp_Links'!A1:E`);
console.log(`\n=== Camp_Links Geo values (camp → geo) ===`);
for (const r of campLinks.slice(2)) {
  const camp = String(r?.[1] ?? '').trim();
  if (!camp) continue;
  console.log(`  ${camp}  =>  ${JSON.stringify(r?.[4] ?? '')}`);
}
// Camps in Master with NO Camp_Links row at all:
const linkedCamps = new Set(campLinks.slice(2).map((r) => String(r?.[1] ?? '').trim()).filter(Boolean));
const unlinked = [...masterCamps].filter((c) => !linkedCamps.has(c));
console.log(`\n=== Master camps with NO Camp_Links entry (${unlinked.length}) ===`);
unlinked.forEach((c) => console.log('  ' + c));

const countryRows = await get(`'Country_L7'!A1:C`);
const countries = new Set();
for (const r of countryRows.slice(3)) {
  const c = String(r?.[2] ?? '').trim();
  if (c && c.toUpperCase() !== 'TOTAL') countries.add(c);
}
console.log(`\n=== Country_L7 distinct countries (${countries.size}) ===`);
console.log([...countries].sort().join(' | '));
