import { NextResponse } from 'next/server';
import { getWriteSheetsClient, getSpreadsheetId } from '@/lib/sheets/client';

// Persistent storage for Bid Recommendations notes. One row per
// country × category in a dedicated `Bid_Notes` tab so notes survive
// reloads/devices and are shared across users (unlike localStorage).
//
// Requires the spreadsheet to be shared with GOOGLE_SERVICE_ACCOUNT_EMAIL as
// Editor — a 403 from Google means edit access hasn't been granted yet.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TAB = 'Bid_Notes';
const HEADER = ['country', 'category', 'note', 'updatedAt'];

function rowKey(country: string, category: string): string {
  return `${country}||${category}`;
}

// Create the tab + header row if it doesn't exist yet. Idempotent.
async function ensureTab(
  sheets: ReturnType<typeof getWriteSheetsClient>,
  spreadsheetId: string,
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === TAB);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!A1:D1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADER] },
  });
}

async function readRows(
  sheets: ReturnType<typeof getWriteSheetsClient>,
  spreadsheetId: string,
): Promise<string[][]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!A:D`,
  });
  return (res.data.values ?? []) as string[][];
}

export async function GET() {
  try {
    const sheets = getWriteSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    await ensureTab(sheets, spreadsheetId);
    const rows = await readRows(sheets, spreadsheetId);
    const notes: Record<string, string> = {};
    rows.slice(1).forEach((r) => {
      const [country, category, note] = r;
      if (country && category && note && String(note).trim() !== '') {
        notes[rowKey(String(country), String(category))] = String(note);
      }
    });
    return NextResponse.json({ notes });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      country?: string;
      category?: string;
      note?: string;
    };
    const country = (body.country ?? '').trim();
    const category = (body.category ?? '').trim();
    const note = body.note ?? '';
    if (!country || !category) {
      return NextResponse.json(
        { error: 'country and category are required' },
        { status: 400 },
      );
    }

    const sheets = getWriteSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    await ensureTab(sheets, spreadsheetId);
    const rows = await readRows(sheets, spreadsheetId);

    // Find existing row (skip header). idx is 0-based in `rows`; sheet row = idx+1.
    let foundIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] ?? '') === country && String(rows[i][1] ?? '') === category) {
        foundIdx = i;
        break;
      }
    }

    const updatedAt = new Date().toISOString();

    if (foundIdx >= 0) {
      const sheetRow = foundIdx + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB}!C${sheetRow}:D${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[note, updatedAt]] },
      });
    } else if (note.trim() !== '') {
      // Only create a row when there's actually a note to store.
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${TAB}!A:D`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[country, category, note, updatedAt]] },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
