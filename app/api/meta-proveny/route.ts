import { NextResponse } from 'next/server';
import snapshot from '@/data/meta-proveny.snapshot.json';
import { fetchMetaProvenyFromGraph, metaGraphConfigured } from '@/lib/meta/graph';
import type { MetaProvenyPayload } from '@/lib/meta/types';

export const dynamic = 'force-dynamic';

// Meta Ads của app Proveny. Có token thì kéo Graph API (cache 15 phút trong
// lib/meta/graph.ts); không có, hoặc Graph lỗi, thì trả snapshot trong repo và
// ghi rõ `stale.reason` để tab hiện cho người xem biết.
export async function GET() {
  const fallback = snapshot as unknown as MetaProvenyPayload;
  if (!metaGraphConfigured()) {
    return NextResponse.json(fallback, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const live = await fetchMetaProvenyFromGraph();
    return NextResponse.json(live, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[meta-proveny] Graph API failed, serving snapshot', err);
    const body: MetaProvenyPayload = {
      ...fallback,
      stale: { reason: err instanceof Error ? err.message : String(err) },
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store', 'x-meta-stale': '1' } });
  }
}
