import { NextResponse } from 'next/server';
import { fetchShopifyDailyRows, listShopifyTabs, probeShopifyWide } from '@/lib/sheets/client';
import { fetchTab } from '@/lib/sheets/client';

// What the two Shopify Ads sources actually contain right now.
//
// Both feed screens that go completely blank when they return nothing — Overbid
// Camps reads the main sheet's 'Shopify_daily' tab, Camp Health reads the
// separate per-day spreadsheet — and an empty screen looks identical whether the
// tab was cleared, the sheet was unshared, or the parser broke. This says which.

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const shopifyId = process.env.GOOGLE_SHEET_ID_SHOPIFY?.trim() ?? '';
  const out: Record<string, unknown> = {
    hasShopifySheetId: Boolean(shopifyId),
    // Reported so "which spreadsheet is this reading?" is answerable without
    // guessing. It's a document id the owner already has, not a credential.
    shopifySheetId: shopifyId,
    shopifySheetUrl: shopifyId ? `https://docs.google.com/spreadsheets/d/${shopifyId}/edit` : '',
  };

  // Every tab in that spreadsheet, with its row count — the reader targets one
  // tab by name ('By campaign'), so a renamed or re-created tab looks exactly
  // like an empty one unless the real list is visible.
  try {
    out.shopifyTabs = await listShopifyTabs();
  } catch (err) {
    out.shopifyTabs = { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  try {
    const rows = await fetchTab('Shopify_daily');
    out.mainSheetTab = {
      rows: rows.length,
      firstRows: rows.slice(0, 3).map((r) => r.slice(0, 12)),
    };
  } catch (err) {
    out.mainSheetTab = { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // Wide look at the same tab: 'By campaign' reports 101k grid rows but A:F
  // returns 306, so the per-day table has moved out of those columns. Dump a
  // wider range to find where it went instead of guessing.
  const url = new URL(req.url);
  const tab = url.searchParams.get('tab') || '';
  try {
    out.probedTab = tab;
    out.wideProbe = await probeShopifyWide(tab || undefined);
  } catch (err) {
    out.wideProbe = { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  try {
    const rows = await fetchShopifyDailyRows();
    // Enough rows to see whether the export carries ONE range block or several
    // — a second From/To block further down would restore period comparison.
    const trim = (r: unknown) => (Array.isArray(r) ? r.slice(0, 8) : r);
    const labelRows = rows
      .map((r, i) => ({ i, r }))
      .filter(({ r }) => Array.isArray(r) && /^(from|to|campaign)$/i.test(String(r[0] ?? r[1] ?? '').trim()))
      .map(({ i, r }) => ({ row: i, cells: trim(r) }));
    out.separateSheet = {
      rows: rows.length,
      firstRows: rows.slice(0, 8).map(trim),
      lastRows: rows.slice(-4).map(trim),
      // Every From/To/Campaign marker, so a multi-block layout is visible.
      markerRows: labelRows,
    };
  } catch (err) {
    out.separateSheet = { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  return NextResponse.json(out);
}
