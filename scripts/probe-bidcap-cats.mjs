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
const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: env.GOOGLE_SHEET_ID, range: `'Max bid cap'!A1:D`, valueRenderOption: 'UNFORMATTED_VALUE' })).data.values || [];
let h = -1, ci = -1;
for (let i = 0; i < 8; i++) {
  const row = rows[i] || [];
  const idx = row.findIndex((c) => String(c).trim().toLowerCase() === 'category');
  if (idx >= 0) { h = i; ci = idx; break; }
}
console.log('header row', h, 'category col', ci, '=>', JSON.stringify(rows[h]));
const cats = new Map();
for (const r of rows.slice(h + 1)) { const c = String(r?.[ci] ?? '').trim(); if (c) cats.set(c, (cats.get(c) || 0) + 1); }
console.log('Bid-cap Category distinct:');
[...cats.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  "${k}"`));
