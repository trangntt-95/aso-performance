import { NextResponse } from 'next/server';
import { fetchShopifyDailyRows } from '@/lib/sheets/client';
import { fetchTab } from '@/lib/sheets/client';

// What the two Shopify Ads sources actually contain right now.
//
// Both feed screens that go completely blank when they return nothing — Overbid
// Camps reads the main sheet's 'Shopify_daily' tab, Camp Health reads the
// separate per-day spreadsheet — and an empty screen looks identical whether the
// tab was cleared, the sheet was unshared, or the parser broke. This says which.

export const dynamic = 'force-dynamic';

export async function GET() {
  const out: Record<string, unknown> = {
    hasShopifySheetId: Boolean(process.env.GOOGLE_SHEET_ID_SHOPIFY?.trim()),
  };

  try {
    const rows = await fetchTab('Shopify_daily');
    out.mainSheetTab = {
      rows: rows.length,
      firstRows: rows.slice(0, 3).map((r) => r.slice(0, 12)),
    };
  } catch (err) {
    out.mainSheetTab = { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  try {
    const rows = await fetchShopifyDailyRows();
    out.separateSheet = {
      rows: rows.length,
      firstRows: rows.slice(0, 3).map((r) => (Array.isArray(r) ? r.slice(0, 12) : r)),
    };
  } catch (err) {
    out.separateSheet = { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  return NextResponse.json(out);
}
