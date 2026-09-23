import { NextResponse } from 'next/server';
import { getWriteSheetsClient, getSpreadsheetId } from '@/lib/sheets/client';

// Ghi lại tab 'Camp_Links' (Trang gọi là Camp_URL) từ body do
// scripts/master/build-camp-links.mjs dựng: tên camp cập nhật theo Shopify Ads
// qua Campaign ID (URL), thêm camp còn thiếu, điền Geo thật từ targeting Shopify,
// giữ nguyên các cột ghi chú F–H Trang viết tay. Backup trước lần ghi đầu:
// exports/backup-Camp_Links-20260923.json.
//
// Layout giữ đúng tab cũ để parseCampLinks đọc như cũ:
//   dòng 1 tiêu đề · dòng 2 header (Category | Camp Name | Campaign ID | URL | Geo | ghi chú…)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TAB = 'Camp_Links';
const HEADER = ['Category', 'Camp Name (chuẩn — từ keyword bidding)', 'Campaign ID', 'URL', 'Geo', 'Ghi chú', '', '', 'Tên cũ (alias)', 'Cập nhật'];

interface UploadBody { title: string; rows: (string | number)[][] }

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
  if (!body?.title || !Array.isArray(body.rows) || body.rows.length < 200 || body.rows.some((r) => r.length !== HEADER.length || !String(r[1]).trim())) {
    return NextResponse.json({ error: `cần title và ≥200 dòng đúng ${HEADER.length} cột, mỗi dòng có tên camp — chặn ghi đè tab bằng dữ liệu hỏng` }, { status: 400 });
  }
  const values: (string | number)[][] = [[body.title], HEADER, ...body.rows];
  try {
    const sheets = getWriteSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    if (!(meta.data.sheets ?? []).some((s) => s.properties?.title === TAB)) {
      return NextResponse.json({ error: `không thấy tab '${TAB}'` }, { status: 404 });
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${TAB}'!A:J` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${TAB}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    return NextResponse.json({ ok: true, tab: TAB, rows: body.rows.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
