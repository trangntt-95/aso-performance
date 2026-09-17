import { NextResponse } from 'next/server';
import { getWriteSheetsClient, getSpreadsheetId } from '@/lib/sheets/client';

// Ghi tab 'Net value per install' từ dữ liệu đã tính sẵn (JSON), thay cho dán
// tay. Dùng khi server không tự đọc được BigQuery: 17/09/2026 không tài khoản
// nào của Trang có quyền IAM trên project trueda, chỉ MCP TrueProfit DA đọc
// được — nên phần tính chạy ở Claude Code qua MCP, rồi đẩy vào đây. Khi IAM
// được cấp, lib/bq/netValue.ts tự tính và endpoint này không cần nữa.
//
// Bảo vệ bằng NET_VALUE_UPLOAD_TOKEN (header x-upload-token). Ghi đè cả tab:
// dòng 1 phạm vi, dòng 2 ghi chú nguồn, dòng 3 trống, dòng 4 tiêu đề — đúng
// layout parseNetValuePerInstall đang đọc.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TAB = 'Net value per install';
const HEADER = [
  'Surface', 'Keyword (raw)', 'Keyword (decoded)', 'Cluster', 'Country', 'Installs', 'Paying shops',
  'Net value ($)', 'Net / install ($)', 'Paid CR (%)', 'Largest shop (orders 30d)', 'Shops with 0 orders (30d)',
];

interface UploadRow {
  surface: string; keyword: string; keywordDecoded?: string; cluster?: string; country: string;
  installs: number; payingShops: number; netValue: number; netPerInstall?: number | null; paidCrPct?: number | null;
  largestShopOrders?: number | null; shopsZeroOrders?: number | null;
}
interface UploadBody { scope: string; note?: string; rows: UploadRow[] }

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
  if (!body?.scope || !Array.isArray(body.rows) || body.rows.length < 50) {
    return NextResponse.json({ error: 'cần scope và ít nhất 50 dòng — chặn ghi đè tab bằng dữ liệu rỗng' }, { status: 400 });
  }

  const values: (string | number)[][] = [
    [body.scope],
    [body.note ?? `Nguồn: BigQuery trueda.trueprofit + GA4 (qua Claude Code). Ghi lúc ${new Date().toISOString()}.`],
    [],
    HEADER,
    ...body.rows.map((r) => [
      r.surface, r.keyword, r.keywordDecoded ?? r.keyword, r.cluster ?? '', r.country,
      r.installs, r.payingShops, Math.round(r.netValue * 100) / 100,
      r.netPerInstall == null ? '' : Math.round(r.netPerInstall * 100) / 100,
      r.paidCrPct == null ? '' : Math.round(r.paidCrPct * 10000) / 10000,
      r.largestShopOrders ?? '', r.shopsZeroOrders ?? '',
    ]),
  ];

  try {
    const sheets = getWriteSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    if (!(meta.data.sheets ?? []).some((s) => s.properties?.title === TAB)) {
      return NextResponse.json({ error: `không thấy tab '${TAB}'` }, { status: 404 });
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${TAB}'!A:Z` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${TAB}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    return NextResponse.json({ ok: true, rows: body.rows.length, scope: body.scope });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
