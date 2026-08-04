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
  parseShopifyCamps,
  parseShopifyDateRange,
  parseSnapshot,
  parseWindowDateRange,
  parseTier1Watch,
} from '@/lib/sheets/parsers';
import { languageOnlyKeywords, overrideToLanguage } from '@/lib/sheets/languageOverride';
import { overrideCategoryExact } from '@/lib/sheets/categoryOverride';
import type { KeywordRow, SheetPayload, SnapshotRow } from '@/lib/sheets/types';

export const revalidate = 600;
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = await fetchAllTabs();
    const masterKwLookup = parseMasterKw(raw['Master KW Lookup'] ?? []);
    const langKws = languageOnlyKeywords(masterKwLookup);
    // Language reclassify, then category fixes (brand, "profit" → Profit, tracker → Feature).
    const fixKw = (rows: KeywordRow[]) => overrideCategoryExact(overrideToLanguage(rows, langKws));
    const fixSnap = (rows: SnapshotRow[]) => overrideCategoryExact(overrideToLanguage(rows, langKws));
    const windowDates: Record<string, { from: string; to: string }> = {};
    (['L3', 'L7', 'L14', 'L30', 'L90'] as const).forEach((w) => {
      const r = parseWindowDateRange(raw[`All_${w}`] ?? []);
      if (r) windowDates[w] = r;
    });
    const payload: SheetPayload = {
      actionQueue: parseActionQueue(raw['Action_Queue'] ?? []),
      marketIndex: parseMarketIndex(raw['Market_Index'] ?? []),
      tier1Watch: parseTier1Watch(raw['Tier1_Market_Watch'] ?? []),
      allL3: fixKw(parseKeywordTab(raw['All_L3'] ?? [], false)),
      allL7: fixKw(parseKeywordTab(raw['All_L7'] ?? [], false)),
      allL14: fixKw(parseKeywordTab(raw['All_L14'] ?? [], false)),
      allL30: fixKw(parseKeywordTab(raw['All_L30'] ?? [], false)),
      allL90: fixKw(parseKeywordTab(raw['All_L90'] ?? [], false)),
      countryL3: fixKw(parseKeywordTab(raw['Country_L3'] ?? [], true)),
      countryL7: fixKw(parseKeywordTab(raw['Country_L7'] ?? [], true)),
      countryL14: fixKw(parseKeywordTab(raw['Country_L14'] ?? [], true)),
      countryL30: fixKw(parseKeywordTab(raw['Country_L30'] ?? [], true)),
      countryL90: fixKw(parseKeywordTab(raw['Country_L90'] ?? [], true)),
      allL365: fixSnap(parseSnapshot(raw['All_L365'] ?? [], false)),
      countryL365: fixSnap(parseSnapshot(raw['Country_L365'] ?? [], true)),
      history: parseHistory(raw['History'] ?? []),
      historyDaily: parseHistoryDaily(raw['History_Daily'] ?? []),
      alertLog: parseAlertLog(raw['AlertLog'] ?? []),
      kwAddedManual: parseKwAddedManual(raw['KW_Added_Manual'] ?? []),
      masterKwLookup,
      pausedKw: parsePausedCamp(raw['Paused_camp'] ?? []),
      campLinks: parseCampLinks(raw['Camp_Links'] ?? []),
      bidCap: parseBidCap(raw['Max bid cap'] ?? []),
      shopifyCamps: parseShopifyCamps(raw['Shopify_daily'] ?? []),
      shopifyDateRange: parseShopifyDateRange(raw['Shopify_daily'] ?? []),
      negativeKw: parseNegativeKw(raw['Negative KW list'] ?? []),
      windowDates,
      fetchedAt: new Date().toISOString(),
    };
    // Guard: a transient Google API failure makes fetchAllTabs swallow the
    // error and return every tab empty. That still parses into a valid-looking
    // payload, and if we cache it (s-maxage + stale-while-revalidate=24h) the
    // whole dashboard shows zeros for everyone until the cache expires. So treat
    // an empty payload as an upstream failure: return 503 with no-store, which
    // (a) is never cached and (b) lets the CDN keep serving the last GOOD copy.
    const hasData =
      payload.actionQueue.length > 0 ||
      payload.allL7.length > 0 ||
      payload.allL30.length > 0 ||
      payload.allL90.length > 0 ||
      payload.marketIndex.summary.length > 0;
    if (!hasData) {
      console.error('Sheets fetch returned an empty payload — treating as upstream failure, not caching.');
      return NextResponse.json(
        { error: 'Upstream sheet fetch returned no data — try again.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Sheets fetch failed:', err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
