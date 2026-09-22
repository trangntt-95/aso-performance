import { NextResponse } from 'next/server';
import { getWriteSheetsClient, getSpreadsheetId } from '@/lib/sheets/client';

// Ghi lại tab 'Master KW Lookup' (camp đang chạy) và 'Paused_camp' (camp đã
// tắt) từ keyword thật của Shopify App Store Ads — scripts/master/build-master.mjs
// dựng body từ GraphQL nội bộ của partners.shopify.com (đọc qua Chrome đăng nhập
// của Trang, không có API công khai). Trước 22/09/2026 hai tab này Trang dán tay,
// nên 44 camp mới không có keyword và 39 camp mang tên cũ; cột "Camp đang bid"
// của dashboard vì thế thiếu camp thật.
//
// Layout giữ đúng header tab cũ để parseMasterKw đọc như cũ:
//   Category | Camp Name | KW | Match Types | Bid (max) | Impressions | Clicks |
//   Installs | Classification | KW status | Campaign ID | Cập nhật | | Source
// Classification (NOISE / POTENTIAL…) là cột Trang gán tay → build script chép
// lại từ tab cũ theo keyword. Backup tab cũ: exports/master-backup-<ngày>.json.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TABS = { master: 'Master KW Lookup', paused: 'Paused_camp' } as const;
const HEADER = [
  'Category', 'Camp Name', 'KW', 'Match Types', 'Bid (max)', 'Impressions', 'Clicks', 'Installs', 'Classification',
  'KW status', 'Campaign ID', 'Cập nhật', '', 'Source',
];

interface UploadBody {
  /** 'master' → tab Master KW Lookup (camp đang chạy); 'paused' → tab Paused_camp. */
  tab: keyof typeof TABS;
  title: string;
  note: string;
  rows: (string | number)[][];
  /** Ngưỡng an toàn: ít hơn thì từ chối (Master thường ~13k dòng, Paused ~5k). */
  minRows?: number;
}

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
  const tab = TABS[body?.tab];
  if (!tab) return NextResponse.json({ error: "tab phải là 'master' hoặc 'paused'" }, { status: 400 });
  const minRows = body.minRows ?? (body.tab === 'master' ? 5000 : 1000);
  if (!body.title || !Array.isArray(body.rows) || body.rows.length < minRows || body.rows.some((r) => r.length !== HEADER.length)) {
    return NextResponse.json({ error: `cần title và ≥${minRows} dòng đúng ${HEADER.length} cột — chặn ghi đè tab bằng dữ liệu hỏng` }, { status: 400 });
  }
  const values: (string | number)[][] = [[body.title], [body.note ?? ''], HEADER, ...body.rows];
  try {
    const sheets = getWriteSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    if (!(meta.data.sheets ?? []).some((s) => s.properties?.title === tab)) {
      return NextResponse.json({ error: `không thấy tab '${tab}'` }, { status: 404 });
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${tab}'!A:N` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tab}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    return NextResponse.json({ ok: true, tab, rows: body.rows.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
