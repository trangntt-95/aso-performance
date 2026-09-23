import { NextResponse } from 'next/server';
import { getWriteSheetsClient, getSpreadsheetId } from '@/lib/sheets/client';

// Ghi tab 'GA4_daily_auto' (cùng layout History_Daily) và
// 'GA4_daily_country_auto' (cùng layout History_Daily_Country) từ GA4 gốc kéo
// về BigQuery mỗi sáng — scripts/net-value/build-ga4-daily.mjs. Thay cho
// History_Daily do Apps Script ghi: tab đó mất install của term nhỏ (tháng
// 9/2026: 31 install paid trong khi GA4 gốc 61). Trang 23/09/2026: "lấy GA4
// gốc làm chuẩn, đổi hết sang GA4".
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TABS = {
  daily: {
    title: 'GA4_daily_auto',
    header: ['date', 'search_term', 'surface', 'users_L7D', 'getApp_L7D', 'cr_L7D', 'pos_L7D', 'users_daily', 'getApp_daily', 'cr_daily', 'pos_daily', 'source'],
    minRows: 500,
  },
  country: {
    title: 'GA4_daily_country_auto',
    header: ['date', 'country', 'search_term', 'surface', 'users_daily', 'getApp_daily', 'cr_daily', 'pos_daily', 'source'],
    minRows: 500,
  },
} as const;

interface UploadBody { tab: keyof typeof TABS; rows: (string | number)[][]; minRows?: number }

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
  const spec = TABS[body?.tab];
  if (!spec) return NextResponse.json({ error: "tab phải là 'daily' hoặc 'country'" }, { status: 400 });
  const minRows = body.minRows ?? spec.minRows;
  if (!Array.isArray(body.rows) || body.rows.length < minRows || body.rows.some((r) => r.length !== spec.header.length)) {
    return NextResponse.json({ error: `cần ≥${minRows} dòng đúng ${spec.header.length} cột` }, { status: 400 });
  }
  const values: (string | number)[][] = [[...spec.header], ...body.rows];
  const lastCol = String.fromCharCode(64 + spec.header.length);
  try {
    const sheets = getWriteSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    if (!(meta.data.sheets ?? []).some((s) => s.properties?.title === spec.title)) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: spec.title } } }] } });
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${spec.title}'!A:${lastCol}` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${spec.title}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    return NextResponse.json({ ok: true, tab: spec.title, rows: body.rows.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
