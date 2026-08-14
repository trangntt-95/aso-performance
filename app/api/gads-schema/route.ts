import { NextResponse } from 'next/server';
import { fetchGoogleAdsTabs } from '@/lib/sheets/googleAds';

// What the Google Ads export actually contains right now: tab names, their
// header row, and a row count. The export script's tab list changes between
// runs, and a parser silently reading a renamed column looks identical to a
// parser reading an empty tab — this makes the difference visible without
// pulling the whole (large) payload.

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = await fetchGoogleAdsTabs();
    const tabs = Object.entries(raw).map(([tab, rows]) => ({
      tab,
      rows: Math.max(0, rows.length - 1),
      header: (rows[0] ?? []).map((h) => String(h ?? '').trim()).filter(Boolean),
      sample: rows[1] ? rows[1].map((c) => String(c ?? '').slice(0, 40)) : [],
    }));
    return NextResponse.json({ count: tabs.length, tabs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
