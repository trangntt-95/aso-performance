import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getNetValueAuto, netValueAutoConfigured } from '@/lib/bq/netValue';

// Net value tự động: xem trạng thái, hoặc làm mới cache (?refresh=1).
// Cron trong vercel.json gọi mỗi sáng; Trang cũng gọi tay được để kiểm tra.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!netValueAutoConfigured()) {
    return NextResponse.json({
      configured: false,
      note: 'Chưa đặt BQ_PROJECT_ID / GA4_PROPERTY_ID (hoặc NET_VALUE_SOURCE=sheet) — dashboard đang đọc tab Net value per install của sheet.',
    });
  }
  const url = new URL(req.url);
  if (url.searchParams.get('refresh') === '1') revalidateTag('net-value');
  try {
    const r = await getNetValueAuto();
    return NextResponse.json({ configured: true, asOf: r.asOf, computedAt: r.computedAt, scope: r.scope, rows: r.rows.length, stats: r.stats, sample: r.rows.slice(0, 5) });
  } catch (err) {
    return NextResponse.json({ configured: true, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
