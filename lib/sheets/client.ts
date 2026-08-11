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

/**
 * The Shopify Ads export lives in a SECOND spreadsheet ("Trang - shopify ad
 * daily"), whose 'By campaign' tab carries one row per campaign PER DAY —
 * Date | Campaign | Impressions | Clicks | Installs | Spend. The main sheet only
 * has the month-total version, which is why a bid change could never be
 * measured before/after. Kept as a separate spreadsheet on purpose: it holds
 * ~100k rows and the main sheet has already hit the 10M-cell ceiling once.
 *
 * Returns [] when GOOGLE_SHEET_ID_SHOPIFY is unset or the tab can't be read, so
 * every caller degrades to the old behaviour rather than failing the payload.
 */
export async function fetchShopifyDailyRows(): Promise<unknown[][]> {
  const id = process.env.GOOGLE_SHEET_ID_SHOPIFY;
  if (!id) return [];
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      // Columns G+ hold an unrelated date-picker widget and a pivot; A:F is the
      // actual table. Row 1 is blank, row 2 is the header.
      range: `'By campaign'!A:F`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    return (res.data.values || []) as unknown[][];
  } catch (e) {
    console.error('fetchShopifyDailyRows failed:', (e as Error).message);
    return [];
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
