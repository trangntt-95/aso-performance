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
// header row 0: Tier | Country | Code | Category
console.log('header', JSON.stringify(rows[0]));
const map = new Map(); // country -> Set(tier)
for (const r of rows.slice(1)) {
  const tier = String(r?.[0] ?? '').trim();
  const country = String(r?.[1] ?? '').trim();
  if (!country) continue;
  if (!map.has(country)) map.set(country, new Set());
  if (tier) map.get(country).add(tier);
}
console.log('countries:', map.size);
const tiers = new Map();
let conflicts = 0;
for (const [c, set] of map) {
  if (set.size > 1) { conflicts++; console.log('  CONFLICT', c, [...set]); }
  for (const t of set) tiers.set(t, (tiers.get(t) || 0) + 1);
}
console.log('distinct tier values:', [...tiers.entries()].sort());
console.log('countries with >1 tier (conflicts):', conflicts);
console.log('\nsample country→tier:');
[...map.entries()].slice(0, 20).forEach(([c, set]) => console.log(`  ${c} → ${[...set].join(',')}`));
