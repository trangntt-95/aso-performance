import { NextResponse } from 'next/server';
import { buildPositionDigest } from '@/lib/digest/positions';
import { renderPositionDigestHtml, sendViaResend } from '@/lib/digest/email';
import type { SheetPayload } from '@/lib/sheets/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Email báo cáo vị trí keyword chính (L3/L7/L14). Vercel Cron gọi 02:00 UTC
// (09:00 VN) mỗi ngày, xem vercel.json.
//
//   GET /api/digest/positions?preview=1   → trả HTML để xem, không gửi
//   GET /api/digest/positions             → gửi tới DIGEST_TO
//
// Nếu env CRON_SECRET có, lệnh gửi phải kèm `Authorization: Bearer <secret>`
// (Vercel Cron tự gắn) hoặc `?key=<secret>`. Không có CRON_SECRET thì ai gọi
// cũng gửi được; tệ nhất là Trang nhận thêm một bản, nên chấp nhận.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const preview = url.searchParams.get('preview') === '1';
  const secret = process.env.CRON_SECRET;
  if (!preview && secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}` && url.searchParams.get('key') !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const origin = process.env.DIGEST_DASHBOARD_URL ?? url.origin;
  const res = await fetch(`${origin}/api/sheets`, { cache: 'no-store' });
  if (!res.ok) {
    return NextResponse.json({ error: `sheets ${res.status}` }, { status: 502 });
  }
  const data = (await res.json()) as SheetPayload;
  const digest = buildPositionDigest(data);
  if (!digest) return NextResponse.json({ error: 'Không có GA4 daily để tính' }, { status: 503 });

  const publicUrl = process.env.DIGEST_DASHBOARD_URL ?? 'https://appstore-performance.vercel.app';
  const { subject, html } = renderPositionDigestHtml(digest, publicUrl);

  if (preview) {
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  const to = (process.env.DIGEST_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) return NextResponse.json({ error: 'DIGEST_TO chưa set' }, { status: 500 });

  try {
    const sent = await sendViaResend({ to, subject, html });
    return NextResponse.json({ ok: true, to, subject, id: sent.id, rows: digest.rows.length, dataDate: digest.dataDate });
  } catch (err) {
    console.error('[digest/positions] send failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
