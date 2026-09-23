import { NextResponse } from 'next/server';
import { getWriteSheetsClient, getSpreadsheetId } from '@/lib/sheets/client';

// Ghi 12 tab cửa sổ GA4 gốc (GA4_All_L{3,7,14,30,90,365}_auto, GA4_Country_L…_auto)
// từ scripts/net-value/build-ga4-windows.mjs — thay All_L*/Country_L* của Apps
// Script (cắt 500 dòng: All_L90 cũ 136 install paid, GA4 gốc 231). Layout y hệt
// tab cũ nên parseKeywordTab/parseSnapshot đọc như cũ. Trang 23/09/2026.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ALLOWED = new Set(
  ['3', '7', '14', '30', '90', '365'].flatMap((w) => [`GA4_All_L${w}_auto`, `GA4_Country_L${w}_auto`]),
);

interface TabBody { name: string; title: string; header: string[]; total: (string | number)[]; rows: (string | number)[][] }
interface UploadBody { tabs: TabBody[] }

export async function POST(req: Request) {
  const token = process.env.NET_VALUE_UPLOAD_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: 'NET_VALUE_UPLOAD_TOKEN chưa đặt' }, { status: 503 });
  if (req.headers.get('x-upload-token') !== token) return NextResponse.json({ error: 'sai token' }, { status: 401 });
  let body: UploadBody;
  try {
    body = (await req.json()) as UploadBody;
  } catch {
    return NextResponse.json({ error: 'body không phải JSON' }, { status: 400 });
  }
  if (!Array.isArray(body?.tabs) || body.tabs.length === 0) return NextResponse.json({ error: 'thiếu tabs' }, { status: 400 });
  for (const t of body.tabs) {
    if (!ALLOWED.has(t.name)) return NextResponse.json({ error: `tab không cho phép: ${t.name}` }, { status: 400 });
    if (!t.title || !Array.isArray(t.header) || !Array.isArray(t.rows) || t.rows.length < 20 || t.rows.some((r) => r.length !== t.header.length)) {
      return NextResponse.json({ error: `${t.name}: cần title, header, ≥20 dòng đúng ${t.header?.length} cột` }, { status: 400 });
    }
  }
  try {
    const sheets = getWriteSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title ?? ''));
    const missing = body.tabs.filter((t) => !existing.has(t.name));
    if (missing.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: missing.map((t) => ({ addSheet: { properties: { title: t.name } } })) },
      });
    }
    const written: Record<string, number> = {};
    for (const t of body.tabs) {
      const lastCol = String.fromCharCode(64 + t.header.length);
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${t.name}'!A:${lastCol}` });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${t.name}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [[t.title], t.header, t.total, ...t.rows] },
      });
      written[t.name] = t.rows.length;
    }
    return NextResponse.json({ ok: true, written });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
