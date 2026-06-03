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

const tab = process.argv[2] || 'Master KW Lookup';
const range = process.argv[3] || 'A1:F50';

const formulaRes = await sheets.spreadsheets.values.get({
  spreadsheetId: env.GOOGLE_SHEET_ID,
  range: `'${tab}'!${range}`,
  valueRenderOption: 'FORMULA',
});

console.log(`=== ${tab}!${range} (FORMULA) ===`);
for (const [i, row] of (formulaRes.data.values || []).entries()) {
  console.log(String(i + 1).padStart(3), '|', (row || []).map((c) => JSON.stringify(c)).join(' | '));
}
