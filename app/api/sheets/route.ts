import { NextResponse } from 'next/server';
import { fetchAllTabs } from '@/lib/sheets/client';
import {
  parseActionQueue,
  parseAlertLog,
  parseHistory,
  parseKeywordTab,
  parseMarketIndex,
  parseSnapshot,
  parseTier1Watch,
} from '@/lib/sheets/parsers';
import type { SheetPayload } from '@/lib/sheets/types';

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = await fetchAllTabs();
    const payload: SheetPayload = {
      actionQueue: parseActionQueue(raw['Action_Queue'] ?? []),
      marketIndex: parseMarketIndex(raw['Market_Index'] ?? []),
      tier1Watch: parseTier1Watch(raw['Tier1_Market_Watch'] ?? []),
      allL3: parseKeywordTab(raw['All_L3'] ?? [], false),
      allL7: parseKeywordTab(raw['All_L7'] ?? [], false),
      allL14: parseKeywordTab(raw['All_L14'] ?? [], false),
      allL30: parseKeywordTab(raw['All_L30'] ?? [], false),
      allL90: parseKeywordTab(raw['All_L90'] ?? [], false),
      countryL3: parseKeywordTab(raw['Country_L3'] ?? [], true),
      countryL7: parseKeywordTab(raw['Country_L7'] ?? [], true),
      countryL14: parseKeywordTab(raw['Country_L14'] ?? [], true),
      countryL30: parseKeywordTab(raw['Country_L30'] ?? [], true),
      countryL90: parseKeywordTab(raw['Country_L90'] ?? [], true),
      allL365: parseSnapshot(raw['All_L365'] ?? [], false),
      countryL365: parseSnapshot(raw['Country_L365'] ?? [], true),
      history: parseHistory(raw['History'] ?? []),
      alertLog: parseAlertLog(raw['AlertLog'] ?? []),
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Sheets fetch failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
