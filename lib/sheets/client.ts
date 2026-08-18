import { google } from 'googleapis';
import { TABS } from './tabs';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
// Read/write scope — only used by the bid-notes writer; needs the sheet shared
// with the service account as Editor.
const WRITE_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuth(scopes: string[] = SCOPES) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !rawKey) {
    throw new Error(
      'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY env var',
    );
  }
  const key = rawKey.replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key,
    scopes,
  });
}

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('Missing GOOGLE_SHEET_ID env var');
  return id;
}

export function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

export function getWriteSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth(WRITE_SCOPES) });
}

export { getSpreadsheetId };

export async function fetchTab(tabName: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${tabName}!A:Z`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return (res.data.values || []) as string[][];
}

/** Excel serial → 'YYYY-MM-DD', or '' when the cell isn't a plausible date. */
function excelDateToIso(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 90000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '').trim());
  return m ? m[0] : '';
}

/** A1 column letters for a zero-based index: 0 → A, 26 → AA. */
function colLetter(i: number): string {
  let n = i;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Per-campaign, per-DAY rows from the separate Shopify Ads spreadsheet.
 *
 * Returned in the fixed shape the parser expects:
 *   [date, campaign, impressions, clicks, installs, spend]
 *
 * Which tab holds this has changed. 'By campaign' used to carry the daily table
 * in A:F; it now holds a single date-range pivot (a From/To block plus totals),
 * so reading A:F returned ~300 aggregate rows and the per-day feed silently went
 * to zero — taking Camp Health's period comparison and the Impact bid column
 * with it. The raw daily table lives in 'Trueprofit 2026', ~100k rows with a
 * 20-column header.
 *
 * Columns are resolved from that header and then fetched individually, so the
 * read stays small AND survives a column being inserted. The old tab remains as
 * a fallback: if the layout is ever restored, nothing here needs changing.
 */
const SHOPIFY_DAILY_TAB = 'Trueprofit 2026';

export async function fetchShopifyDailyRows(): Promise<unknown[][]> {
  // Trimmed: a value set through a shell pipe can carry a trailing newline,
  // which the Sheets API rejects as a malformed spreadsheet id.
  const id = process.env.GOOGLE_SHEET_ID_SHOPIFY?.trim();
  if (!id) return [];
  const sheets = getSheetsClient();

  try {
    const head = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `'${SHOPIFY_DAILY_TAB}'!A1:AZ1`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const header = ((head.data.values?.[0] ?? []) as unknown[]).map((h) =>
      String(h ?? '').trim().toLowerCase(),
    );
    const at = (...names: string[]): number => {
      for (const n of names) {
        const i = header.indexOf(n);
        if (i >= 0) return i;
      }
      return -1;
    };
    // 'Ad Name' is the campaign label the rest of the dashboard keys on;
    // 'Campaign' in this tab is the brand/non-brand grouping, not a camp name.
    const idx = {
      date: at('start date', 'date'),
      camp: at('ad name', 'campaign name'),
      impressions: at('impressions'),
      clicks: at('clicks'),
      installs: at('installs'),
      spend: at('spend'),
    };
    const missing = Object.entries(idx).filter(([, v]) => v < 0).map(([k]) => k);
    if (missing.length > 0) {
      throw new Error(`'${SHOPIFY_DAILY_TAB}' thiếu cột: ${missing.join(', ')}`);
    }

    const order = ['date', 'camp', 'impressions', 'clicks', 'installs', 'spend'] as const;
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: id,
      ranges: order.map((k) => {
        const L = colLetter(idx[k]);
        return `'${SHOPIFY_DAILY_TAB}'!${L}2:${L}`;
      }),
      valueRenderOption: 'UNFORMATTED_VALUE',
      majorDimension: 'COLUMNS',
    });
    const cols = (res.data.valueRanges ?? []).map((vr) => (vr.values?.[0] ?? []) as unknown[]);
    if (cols.length !== order.length) throw new Error('batchGet trả thiếu cột');

    const n = Math.max(...cols.map((c) => c.length));
    const out: unknown[][] = [];
    for (let i = 0; i < n; i++) {
      const iso = excelDateToIso(cols[0][i]);
      const camp = String(cols[1][i] ?? '').trim();
      if (!iso || !camp) continue;
      out.push([iso, camp, cols[2][i], cols[3][i], cols[4][i], cols[5][i]]);
    }
    if (out.length > 0) return out;
    throw new Error(`'${SHOPIFY_DAILY_TAB}' không có dòng nào đọc được`);
  } catch (e) {
    console.error('fetchShopifyDailyRows (per-day tab) failed:', (e as Error).message);
  }

  // Fallback: the old location, in case the daily table moves back.
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `'By campaign'!A:F`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    return (res.data.values || []) as unknown[][];
  } catch (e) {
    console.error('fetchShopifyDailyRows (fallback) failed:', (e as Error).message);
    return [];
  }
}

/** Raw rows of the 'By campaign' range-aggregate block, for campaign totals. */
export async function fetchShopifyAggregateRows(): Promise<unknown[][]> {
  const id = process.env.GOOGLE_SHEET_ID_SHOPIFY?.trim();
  if (!id) return [];
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `'By campaign'!A:F`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    return (res.data.values || []) as unknown[][];
  } catch (e) {
    console.error('fetchShopifyAggregateRows failed:', (e as Error).message);
    return [];
  }
}

/**
 * Tab names + sizes of the Shopify Ads spreadsheet.
 *
 * fetchShopifyDailyRows targets one tab by name, so a renamed tab, a re-created
 * file or a lost share all produce the same empty array. This distinguishes them.
 */
export async function listShopifyTabs(): Promise<
  { title: string; rows: number; cols: number }[] | { error: string }
> {
  const id = process.env.GOOGLE_SHEET_ID_SHOPIFY?.trim();
  if (!id) return { error: 'GOOGLE_SHEET_ID_SHOPIFY chưa được set' };
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties(title,gridProperties)',
    });
    return (res.data.sheets ?? []).map((sh) => ({
      title: sh.properties?.title ?? '',
      rows: sh.properties?.gridProperties?.rowCount ?? 0,
      cols: sh.properties?.gridProperties?.columnCount ?? 0,
    }));
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * A wide, shallow read of the Shopify 'By campaign' tab.
 *
 * Diagnostic only. The tab's grid is ~101k rows while the A:F read returns a few
 * hundred, which means the per-day table no longer starts in column A — this
 * shows what each column actually holds so the real range can be targeted.
 */
export async function probeShopifyWide(tab = 'By campaign'): Promise<unknown> {
  const id = process.env.GOOGLE_SHEET_ID_SHOPIFY?.trim();
  if (!id) return { error: 'GOOGLE_SHEET_ID_SHOPIFY chưa được set' };
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: tab === 'By campaign' ? `'By campaign'!A1:T40` : `'${tab}'!A1:T25`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const rows = (res.data.values ?? []) as unknown[][];
    return {
      returnedRows: rows.length,
      // Only the first 20 columns, trimmed, so the shape is readable.
      sample: rows.map((r, i) => ({
        row: i + 1,
        cells: (r ?? []).slice(0, 20).map((c) => (c === '' || c == null ? null : String(c).slice(0, 26))),
      })),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function fetchAllTabs(): Promise<Record<string, string[][]>> {
  const sheets = getSheetsClient();
  const result: Record<string, string[][]> = {};
  try {
    const ranges = TABS.map((t) => `${t}!A:Z`);
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: getSpreadsheetId(),
      ranges,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    (res.data.valueRanges || []).forEach((vr, i) => {
      result[TABS[i]] = (vr.values || []) as string[][];
    });
    return result;
  } catch {
    // Fallback: a tab is missing — fetch each tab individually, skip 404s.
    await Promise.all(
      TABS.map(async (t) => {
        try {
          result[t] = await fetchTab(t);
        } catch {
          result[t] = [];
        }
      }),
    );
    return result;
  }
}
