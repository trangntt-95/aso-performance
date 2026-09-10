import { NextResponse } from 'next/server';
import { parseExcludedCountries, parseMarketTiers } from '@/lib/sheets/parsers';
import {
  fetchShopifyDailyRows,
  fetchTab,
  listMainTabs,
  listShopifyTabs,
  probeMainTab,
  probeShopifyWide,
} from '@/lib/sheets/client';

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

  // Tab thật sự có trong sheet chính. TABS là danh sách muốn đọc; hai cái lệch
  // nhau là lúc một tab vừa đổi tên hoặc vừa được thêm.
  try {
    out.mainTabs = await listMainTabs();
  } catch (err) {
    out.mainTabs = { error: err instanceof Error ? err.message : 'Unknown error' };
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
  // ?main=<tên tab>&mainRange=A1:Z20 — chụp thô một tab của sheet chính.
  const mainTab = url.searchParams.get('main') || '';
  if (mainTab) {
    out.mainProbe = await probeMainTab(mainTab, url.searchParams.get('mainRange') || undefined);
  }
  const tab = url.searchParams.get('tab') || '';
  try {
    out.probedTab = tab;
    out.wideProbe = await probeShopifyWide(tab || undefined, url.searchParams.get('range') || undefined);
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

  // What the route actually receives for 'Countries performance'. Kept, not temporary:
  // both the exclude column and the tier block have already been renamed and
  // moved once, and Sheets trims trailing empty cells so the header row can be
  // SHORTER than the rows below it — that combination is what made the exclude
  // list parse locally and come back empty in the payload. Row widths and the
  // parsed count together make that visible in one look.
  try {
    const rows = await fetchTab('Countries performance');
    out.perGeoTab = {
      rows: rows.length,
      // Widest row vs header row: when these differ, a column exists that a
      // header-length scan would never reach.
      widestRow: rows.reduce((w, r) => Math.max(w, (r ?? []).length), 0),
      headerRowLen: (rows[0] ?? []).length,
      parsedExcluded: parseExcludedCountries(rows).length,
      // Ảnh chụp thô: khi một block ngừng parse ra dòng nào, thứ cần nhìn là
      // header của nó còn nằm ở cột nào — không phải đoán.
      sample: rows.slice(0, 14).map((r, i) => ({
        row: i + 1,
        cells: (r ?? []).slice(0, 26).map((c) => (c === '' || c == null ? null : String(c).slice(0, 22))),
      })),
      parsedTiers: parseMarketTiers(rows).map((t) => ({
        tier: t.tier,
        bid: t.bidText,
        countries: t.countries.length,
      })),
    };
  } catch (err) {
    out.perGeoTab = { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // 'Max bid cap' cũng vừa được sắp lại: nhiều cột parser vẫn đọc giờ rỗng
  // toàn bộ (cpiCap, instL90, clicksL30, crActual). Cần nhìn header thật để
  // biết cột đã dời đi đâu hay đã bỏ hẳn.
  try {
    const rows = await fetchTab('Max bid cap');
    out.bidCapTab = {
      rows: rows.length,
      widestRow: rows.reduce((w, r) => Math.max(w, (r ?? []).length), 0),
      sample: rows.slice(0, 8).map((r, i) => ({
        row: i + 1,
        cells: (r ?? []).slice(0, 26).map((c) => (c === '' || c == null ? null : String(c).slice(0, 22))),
      })),
    };
  } catch (err) {
    out.bidCapTab = { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  return NextResponse.json(out);
}
