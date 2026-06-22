import { NextResponse } from 'next/server';
import { getWriteSheetsClient, getSpreadsheetId } from '@/lib/sheets/client';

// Generic per-row notes, shared across pages via a `scope` (e.g. 'underbid',
// 'overbid') + a free-form `key` (keyword term, camp name). Stored in a single
// `App_Notes` tab so notes survive reloads/devices and are shared across users.
// Bid Recommendations keeps its own /api/bid-notes + Bid_Notes tab (2-part key);
// this endpoint is for everything else.
//
// Requires the spreadsheet shared with GOOGLE_SERVICE_ACCOUNT_EMAIL as Editor.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TAB = 'App_Notes';
const HEADER = ['scope', 'key', 'note', 'updatedAt'];
// Map-key separator in the GET response — must match the client store (notesStore.ts).
const SEP = '||';

function composite(scope: string, key: string): string {
  return `${scope}${SEP}${key}`;
}

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
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A:D` });
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
      const [scope, key, note] = r;
      if (scope && key && note && String(note).trim() !== '') {
        notes[composite(String(scope), String(key))] = String(note);
      }
    });
    return NextResponse.json({ notes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { scope?: string; key?: string; note?: string };
    const scope = (body.scope ?? '').trim();
    const key = (body.key ?? '').trim();
    const note = body.note ?? '';
    if (!scope || !key) {
      return NextResponse.json({ error: 'scope and key are required' }, { status: 400 });
    }

    const sheets = getWriteSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    await ensureTab(sheets, spreadsheetId);
    const rows = await readRows(sheets, spreadsheetId);

    // Find existing row (skip header). idx is 0-based in `rows`; sheet row = idx+1.
    let foundIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] ?? '') === scope && String(rows[i][1] ?? '') === key) {
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
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${TAB}!A:D`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[scope, key, note, updatedAt]] },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
