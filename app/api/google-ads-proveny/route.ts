import { NextResponse } from 'next/server';
import { fetchGoogleAdsTabs, parseGoogleAds } from '@/lib/sheets/googleAds';
import { GADS_ACCOUNTS } from '@/lib/market/googleAdsAccounts';
import type { GoogleAdsPayload } from '@/lib/sheets/googleAdsTypes';

export const dynamic = 'force-dynamic';

// Google Ads của app PROVENY: sheet export riêng (GOOGLE_SHEET_ID_GADS_PROVENY),
// cùng Ads Script và schema với sheet của TrueProfit. Tách khỏi /api/sheets để
// không phình payload chính (đã ~47MB) và để tab Proveny không dính dữ liệu ASO.

export interface GoogleAdsProvenyResponse {
  configured: boolean;
  fetchedAt: string;
  googleAds: GoogleAdsPayload;
  stale?: { reason: string };
}

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; body: GoogleAdsProvenyResponse } | null = null;

export async function GET() {
  const id = process.env.GOOGLE_SHEET_ID_GADS_PROVENY?.trim();
  if (!id) {
    const body: GoogleAdsProvenyResponse = { configured: false, fetchedAt: new Date().toISOString(), googleAds: parseGoogleAds({}) };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.body, { headers: { 'Cache-Control': 'no-store', 'x-cache': 'hit' } });
  }
  try {
    const raw = await fetchGoogleAdsTabs(id);
    const body: GoogleAdsProvenyResponse = {
      configured: true,
      fetchedAt: new Date().toISOString(),
      googleAds: parseGoogleAds(raw, { websiteHosts: GADS_ACCOUNTS.proveny.websiteHosts }),
    };
    cache = { at: Date.now(), body };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('[google-ads-proveny] đọc sheet lỗi', err);
    if (cache) {
      return NextResponse.json({ ...cache.body, stale: { reason } }, { headers: { 'Cache-Control': 'no-store', 'x-gads-stale': '1' } });
    }
    return NextResponse.json({ error: reason }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
