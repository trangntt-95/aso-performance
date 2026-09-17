import { NextResponse } from 'next/server';
import { getSheetsClient, getSpreadsheetId } from '@/lib/sheets/client';

// Đọc thô một tab của sheet ASO (giá trị hoặc công thức) — công cụ bảo trì,
// bảo vệ bằng NET_VALUE_UPLOAD_TOKEN. Có vì 17/09/2026 không tài khoản nào trên
// máy Trang mở được sheet qua API, mà cần biết cột NPI của 'Max bid cap' là
// giá trị dán hay công thức trước khi để pipeline ghi vào.
//   GET /api/sheets/raw?tab=Max%20bid%20cap&rows=30&formula=1
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const token = process.env.NET_VALUE_UPLOAD_TOKEN?.trim();
  if (!token || req.headers.get('x-upload-token') !== token) {
    return NextResponse.json({ error: 'sai token' }, { status: 401 });
  }
  const url = new URL(req.url);
  const tab = url.searchParams.get('tab')?.trim();
  if (!tab) return NextResponse.json({ error: 'thiếu ?tab=' }, { status: 400 });
  const rows = Math.min(2000, Math.max(1, Number(url.searchParams.get('rows') ?? 50)));
  const formula = url.searchParams.get('formula') === '1';
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: `'${tab}'!A1:Z${rows}`,
      valueRenderOption: formula ? 'FORMULA' : 'FORMATTED_VALUE',
    });
    return NextResponse.json({ tab, formula, rows: res.data.values ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
