import { NextResponse } from 'next/server';
import { getWriteSheetsClient, getSpreadsheetId } from '@/lib/sheets/client';

// Ghi lại tab 'Max bid cap' từ dữ liệu pipeline (scripts/net-value/build-npi.mjs).
// Tab này Trang từng dựng bằng MCP rồi dán; 17/09/2026 đọc thô thấy toàn giá
// trị, không công thức, nên pipeline tính lại và ghi nguyên tab mỗi sáng:
//   NPI (country × category, YTD net/install, mỏng → NPI category toàn cầu)
//   NPI×90% · Country NetVal×90% (net/install nước × 0.9) · Eff = min của hai
//   Tier Ceil và CR used GIỮ NGUYÊN từ tab (cấu hình + CR theo cluster)
//   Bid Rec = min(Eff × CR, Tier Ceil) · ⚠️ khi bid > $45
// Layout giữ đúng 15 cột như tab đang có để parseBidCap đọc như cũ. Bản backup
// trước lần ghi đầu: exports/max-bid-cap-backup-20260917.json.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TAB = 'Max bid cap';
const HEADER = [
  'Cat#', 'Ctry#', 'Country', 'Tier', 'Category', 'Keyword Cluster', 'Example keywords',
  'NPI\n(cluster×ctry)', 'NPI\n×90%', 'Country\nNetVal×90%', 'Eff. Max CPI\n(min of both)', 'Tier Ceil', 'CR used', 'Bid Rec ⭐', '⚠️',
];

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
  if (!body?.title || !Array.isArray(body.rows) || body.rows.length < 500 || body.rows.some((r) => r.length !== HEADER.length)) {
    return NextResponse.json({ error: `cần title và ≥500 dòng đúng ${HEADER.length} cột — chặn ghi đè tab bằng dữ liệu hỏng` }, { status: 400 });
  }
  const values: (string | number)[][] = [
    [body.title, '', '', '', 'Bid=min(Eff. Max CPI×CR, tier_ceil)  |  NPI = YTD net value/install theo Country×Category (mỏng → category toàn cầu)  |  Country NetVal = net/install 4 tháng gần nhất  |  CR used giữ từ tab  |  ⚠️=bid>$45  |  tự động hằng ngày (Claude Code)'],
    HEADER,
    ...body.rows,
  ];
  try {
    const sheets = getWriteSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    if (!(meta.data.sheets ?? []).some((s) => s.properties?.title === TAB)) {
      return NextResponse.json({ error: `không thấy tab '${TAB}'` }, { status: 404 });
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${TAB}'!A:O` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${TAB}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    return NextResponse.json({ ok: true, rows: body.rows.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
