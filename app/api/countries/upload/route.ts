import { NextResponse } from 'next/server';
import { getWriteSheetsClient, getSpreadsheetId } from '@/lib/sheets/client';

// Ghi tab 'Countries_performance_auto' — khối doanh thu theo nước tính từ
// BigQuery (4 tháng gần nhất đã kết thúc), thay cho khối dán tay theo quý ở
// cột I–P của 'Countries performance'. Tab mới, không đụng tab cũ vì tab cũ còn
// chứa cấu hình trần CPI, Excluded Countries và khối Tier Trang sửa tay.
// /api/sheets ưu tiên tab này khi có đủ dòng, không có thì đọc khối cũ.
//
// Cùng token với /api/net-value/upload (NET_VALUE_UPLOAD_TOKEN). Layout: dòng 1
// kỳ (parser lấy làm perGeoRevenuePeriod), dòng 2 nguồn, dòng 3 trống, dòng 4
// tiêu đề, rồi dữ liệu. Tạo tab nếu chưa có.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const COUNTRIES_AUTO_TAB = 'Countries_performance_auto';
const HEADER = [
  'Rank', 'Country', 'Installs', 'First paid', 'First paid CR (%)', 'ARPPU ($)',
  'Revenue (gross $)', 'Value / install ($)', 'Net revenue ($)', 'Net / install ($)',
];

interface UploadRow {
  country: string; installs: number; firstPaid: number; gross: number; net: number;
}
interface UploadBody { period: string; note?: string; rows: UploadRow[] }

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
  if (!body?.period || !Array.isArray(body.rows) || body.rows.length < 20) {
    return NextResponse.json({ error: 'cần period và ít nhất 20 nước — chặn ghi đè bằng dữ liệu rỗng' }, { status: 400 });
  }

  const sorted = [...body.rows].sort((a, b) => b.gross - a.gross || b.installs - a.installs);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const values: (string | number)[][] = [
    [body.period],
    [body.note ?? `Nguồn: BigQuery trueda.trueprofit (partner_events install, partner_transactions, shops.CountryName, loại testing_shops). Ghi ${new Date().toISOString()}.`],
    [],
    HEADER,
    ...sorted.map((r, i) => [
      i + 1, r.country, r.installs, r.firstPaid,
      r.installs > 0 ? r2((r.firstPaid / r.installs) * 100) : '',
      r.firstPaid > 0 ? r2(r.gross / r.firstPaid) : '',
      r2(r.gross),
      r.installs > 0 ? r2(r.gross / r.installs) : '',
      r2(r.net),
      r.installs > 0 ? r2(r.net / r.installs) : '',
    ]),
  ];

  try {
    const sheets = getWriteSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    if (!(meta.data.sheets ?? []).some((s) => s.properties?.title === COUNTRIES_AUTO_TAB)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: COUNTRIES_AUTO_TAB } } }] },
      });
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${COUNTRIES_AUTO_TAB}'!A:Z` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${COUNTRIES_AUTO_TAB}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    return NextResponse.json({ ok: true, rows: sorted.length, period: body.period });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
