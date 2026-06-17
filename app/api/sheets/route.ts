import { NextResponse } from 'next/server';
import { fetchAllTabs } from '@/lib/sheets/client';
import {
  parseActionQueue,
  parseAlertLog,
  parseBidCap,
  parseHistory,
  parseHistoryDaily,
  parseKeywordTab,
  parseCampLinks,
  parseKwAddedManual,
  parseMarketIndex,
  parseMasterKw,
  parseNegativeKw,
  parsePausedCamp,
  parseSnapshot,
  parseWindowDateRange,
  parseTier1Watch,
} from '@/lib/sheets/parsers';
import { languageOnlyKeywords, overrideToLanguage } from '@/lib/sheets/languageOverride';
import type { SheetPayload } from '@/lib/sheets/types';

export const revalidate = 600;
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = await fetchAllTabs();
    const masterKwLookup = parseMasterKw(raw['Master KW Lookup'] ?? []);
    const langKws = languageOnlyKeywords(masterKwLookup);
    const windowDates: Record<string, { from: string; to: string }> = {};
    (['L3', 'L7', 'L14', 'L30', 'L90'] as const).forEach((w) => {
      const r = parseWindowDateRange(raw[`All_${w}`] ?? []);
      if (r) windowDates[w] = r;
    });
    const payload: SheetPayload = {
      actionQueue: parseActionQueue(raw['Action_Queue'] ?? []),
      marketIndex: parseMarketIndex(raw['Market_Index'] ?? []),
      tier1Watch: parseTier1Watch(raw['Tier1_Market_Watch'] ?? []),
      allL3: overrideToLanguage(parseKeywordTab(raw['All_L3'] ?? [], false), langKws),
      allL7: overrideToLanguage(parseKeywordTab(raw['All_L7'] ?? [], false), langKws),
      allL14: overrideToLanguage(parseKeywordTab(raw['All_L14'] ?? [], false), langKws),
      allL30: overrideToLanguage(parseKeywordTab(raw['All_L30'] ?? [], false), langKws),
      allL90: overrideToLanguage(parseKeywordTab(raw['All_L90'] ?? [], false), langKws),
      countryL3: overrideToLanguage(parseKeywordTab(raw['Country_L3'] ?? [], true), langKws),
      countryL7: overrideToLanguage(parseKeywordTab(raw['Country_L7'] ?? [], true), langKws),
      countryL14: overrideToLanguage(parseKeywordTab(raw['Country_L14'] ?? [], true), langKws),
      countryL30: overrideToLanguage(parseKeywordTab(raw['Country_L30'] ?? [], true), langKws),
      countryL90: overrideToLanguage(parseKeywordTab(raw['Country_L90'] ?? [], true), langKws),
      allL365: overrideToLanguage(parseSnapshot(raw['All_L365'] ?? [], false), langKws),
      countryL365: overrideToLanguage(parseSnapshot(raw['Country_L365'] ?? [], true), langKws),
      history: parseHistory(raw['History'] ?? []),
      historyDaily: parseHistoryDaily(raw['History_Daily'] ?? []),
      alertLog: parseAlertLog(raw['AlertLog'] ?? []),
      kwAddedManual: parseKwAddedManual(raw['KW_Added_Manual'] ?? []),
      masterKwLookup,
      pausedKw: parsePausedCamp(raw['Paused_camp'] ?? []),
      campLinks: parseCampLinks(raw['Camp_Links'] ?? []),
      bidCap: parseBidCap(raw['Max bid cap'] ?? []),
      negativeKw: parseNegativeKw(raw['Negative KW list'] ?? []),
      windowDates,
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Sheets fetch failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
