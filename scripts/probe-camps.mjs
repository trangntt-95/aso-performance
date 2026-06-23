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
const get = async (r) =>
  (await sheets.spreadsheets.values.get({ spreadsheetId: env.GOOGLE_SHEET_ID, range: r, valueRenderOption: 'UNFORMATTED_VALUE' })).data.values || [];

const rows = await get(`'Camp_Links'!A1:E`);
let h = -1;
for (let i = 0; i < 10; i++) {
  if (String(rows[i]?.[0] ?? '').trim() === 'Category' && String(rows[i]?.[2] ?? '').trim() === 'Campaign ID') { h = i; break; }
}
console.log('header idx', h, '=>', JSON.stringify(rows[h]));
const data = rows.slice(h + 1).filter((r) => String(r?.[1] ?? '').trim());
console.log('camp rows:', data.length);

const cats = new Map();
for (const r of data) { const c = String(r[0] ?? '').trim(); cats.set(c, (cats.get(c) || 0) + 1); }
console.log('\nCategory COLUMN distinct values:');
[...cats.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  "${k}"`));

const fw = new Map();
for (const r of data) { const name = String(r[1] ?? '').trim(); const first = name.split(/[\s\-_|]+/)[0]; fw.set(first, (fw.get(first) || 0) + 1); }
console.log('\nFIRST WORD of camp name distinct:');
[...fw.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  "${k}"`));

console.log('\nSAMPLE rows:');
for (const r of data.slice(0, 30)) console.log(`  cat="${r[0]}" | camp="${r[1]}" | url=${r[3] ? 'Y' : '-'} | geo="${String(r[4] ?? '').replace(/\n/g, ' ').slice(0, 22)}"`);
