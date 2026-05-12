# TrueProfit ASO Dashboard — Full Implementation Spec

> **For Claude Code:** This document supplements `USER_STORY_DASHBOARD.md` with complete technical specifications. Read both documents before writing any code.

**Target stack:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Recharts + React Query
**Deploy target:** Vercel (free tier)
**Auth:** Google Sheets API v4 via service account
**Total dev time estimate:** 1-2 weeks for Phase 1 MVP

---

## 1. Tech Stack — Confirmed Versions

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "typescript": "^5.4.0",
    "@tanstack/react-query": "^5.40.0",
    "googleapis": "^140.0.0",
    "tailwindcss": "^3.4.0",
    "lucide-react": "^0.400.0",
    "recharts": "^2.12.0",
    "date-fns": "^3.6.0",
    "zustand": "^4.5.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "eslint": "^8",
    "eslint-config-next": "^14.2.0"
  }
}
```

**shadcn/ui components to install:**
```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card badge tabs select dropdown-menu input table dialog sheet command tooltip popover scroll-area separator skeleton
```

---

## 2. Project Structure

```
trueprofit-aso-dashboard/
├── app/
│   ├── api/
│   │   └── sheets/
│   │       ├── route.ts                  # GET /api/sheets — fetch all tabs (cached)
│   │       └── [tab]/route.ts            # GET /api/sheets/[tab] — fetch single tab
│   ├── (dashboard)/
│   │   ├── layout.tsx                    # Sidebar + main content layout
│   │   ├── page.tsx                      # Default: Action Queue
│   │   ├── market-index/page.tsx
│   │   ├── geo-opportunity/page.tsx
│   │   ├── tier1-watch/page.tsx
│   │   ├── category/[name]/page.tsx
│   │   ├── keyword/[term]/page.tsx       # Drill-down per keyword
│   │   └── trends/page.tsx
│   ├── globals.css
│   └── layout.tsx                        # Root with ReactQueryProvider
├── components/
│   ├── ui/                               # shadcn primitives
│   ├── action-queue/
│   │   ├── ActionQueueTable.tsx
│   │   ├── ActionQueueRow.tsx
│   │   ├── PriorityBadge.tsx
│   │   ├── AlertBadge.tsx
│   │   ├── BidActionBadge.tsx
│   │   ├── FiltersBar.tsx
│   │   └── StatusDropdown.tsx
│   ├── market-index/
│   │   ├── MarketIndexCards.tsx
│   │   ├── WindowCard.tsx
│   │   ├── FunnelBreakdown.tsx
│   │   └── NarrativePanel.tsx
│   ├── geo-opportunity/
│   │   ├── GeoOpportunityTable.tsx
│   │   ├── CountryGroup.tsx
│   │   └── ExportCsvButton.tsx
│   ├── keyword-trend/
│   │   ├── TrendChart.tsx
│   │   └── KeywordModal.tsx
│   ├── shared/
│   │   ├── Sidebar.tsx
│   │   ├── TopBar.tsx
│   │   ├── RefreshButton.tsx
│   │   ├── CategoryChip.tsx
│   │   ├── CountryFlag.tsx
│   │   ├── SurfaceIcon.tsx
│   │   └── SearchBox.tsx
│   └── providers/
│       └── ReactQueryProvider.tsx
├── lib/
│   ├── sheets/
│   │   ├── client.ts                     # Google Sheets API client
│   │   ├── parsers.ts                    # Parse each tab type → typed objects
│   │   ├── types.ts                      # All TypeScript interfaces
│   │   └── tabs.ts                       # Tab name constants
│   ├── utils/
│   │   ├── format.ts                     # Number/percent/date formatters
│   │   ├── colors.ts                     # Alert/action/category color maps
│   │   ├── alerts.ts                     # Alert metadata (emoji, severity)
│   │   └── csv.ts                        # CSV export helpers
│   ├── hooks/
│   │   ├── useSheetData.ts               # React Query hook for sheet fetch
│   │   ├── useFilters.ts                 # URL-synced filter state
│   │   └── useLocalStorage.ts            # Status + notes persistence
│   └── store/
│       └── statusStore.ts                # Zustand for status/notes
├── public/
│   ├── flags/                            # SVG country flags
│   └── icons/
├── .env.local                            # Service account creds
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## 3. Google Sheets API Setup

### 3.1 Service Account Creation
```bash
# Steps for Trang to do once:
# 1. Go to https://console.cloud.google.com/iam-admin/serviceaccounts
# 2. Create service account: "trueprofit-aso-dashboard"
# 3. Generate JSON key, save as service-account-key.json
# 4. Share Google Sheet with service account email (Viewer access)
# 5. Get GOOGLE_SHEET_ID from sheet URL
```

### 3.2 Environment Variables (.env.local)
```bash
GOOGLE_SHEET_ID=1abc...xyz
GOOGLE_SERVICE_ACCOUNT_EMAIL=trueprofit-aso@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
NEXT_PUBLIC_APP_NAME="TrueProfit ASO"
NODE_ENV=production
```

**For Vercel deploy:** add same vars in Vercel dashboard → Settings → Environment Variables.

### 3.3 Sheets API client (`lib/sheets/client.ts`)
```typescript
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

export function getSheetsClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
    SCOPES
  );
  return google.sheets({ version: 'v4', auth });
}

export async function fetchTab(tabName: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:Z`,
    valueRenderOption: 'UNFORMATTED_VALUE',  // get raw numbers, not formatted strings
  });
  return res.data.values || [];
}

export async function fetchAllTabs(): Promise<Record<string, string[][]>> {
  const sheets = getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tabs = [
    'Action_Queue', 'Market_Index', 'Tier1_Market_Watch', 'Keyword_Opportunity_Lab',
    'All_L3', 'All_L7', 'All_L14', 'All_L30', 'All_L90', 'All_L365',
    'Country_L3', 'Country_L7', 'Country_L14', 'Country_L30', 'Country_L90', 'Country_L365',
    'History',
  ];
  const ranges = tabs.map(t => `${t}!A:Z`);
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const result: Record<string, string[][]> = {};
  (res.data.valueRanges || []).forEach((vr, i) => {
    result[tabs[i]] = vr.values || [];
  });
  return result;
}
```

---

## 4. TypeScript Interfaces (`lib/sheets/types.ts`)

```typescript
// === Alert types ===
export type AlertType =
  | '🚨 USER DROP + POS WORSEN'
  | '⚠️ POSITION WORSEN'
  | '💔 INSTALL DROP'
  | '💸 CR DROP'
  | '📉 USER DROP'
  | 'OK'
  | '🌱 user growth + pos improve'
  | '📈 pos improve'
  | '❤️ install up'
  | '💚 cr improve'
  | '🚀 user growth'
  | '🎯 ORG STRONG, PAID MISSING'
  | '🎯 ORG STRONG, PAID WEAK'
  | '🎯 ORG GOOD, POS LOW';

export type Surface = 'search' | 'search_ad';  // organic | paid

export type Category =
  | 'Brand' | 'Competitor' | 'Profit' | 'Feature' | 'CatePage'
  | 'Category' | 'Language' | 'Others' | 'Test' | 'CPM' | 'Noise' | 'Unknown';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export type Window = 'L3' | 'L7' | 'L14' | 'L30' | 'L90' | 'L365' | 'L90+L30';

export type BidAction =
  // Paid actions
  | 'RAISE BID' | 'REDUCE BID' | 'AUDIT KW' | 'AUDIT MATCH TYPE'
  | 'NEGATIVE' | 'PAUSE' | 'SCALE' | 'MONITOR' | 'HOLD'
  // Organic actions
  | 'EXPAND TO PAID' | 'RAISE BID PAID' | 'HOLD PAID' | 'REVIEW PAID BID'
  | 'CHECK ORGANIC' | 'CHECK ORGANIC ALGO' | 'CHECK LISTING'
  | 'REVIEW LISTING' | 'MONITOR ORGANIC'
  | 'REVIEW';

// === Action Queue row ===
export interface ActionQueueRow {
  priority: Priority;
  score: number;
  category: Category;
  keyword: string;
  surface: 'organic' | 'paid';  // derived from search/search_ad
  country: string;  // "(global)" if cross-country aggregate
  window: Window;
  alert: AlertType;
  bidAction: BidAction;
  bidSuggest: string;  // e.g., "+10%", "$5-8", "—"
  targetCamp: string;
  note: string;
  keyStats: string;  // "Users 35→27 | GetApp 8→4 | Pos 1.0→1.2 | CR 14.8%"
}

// === Market Index row ===
export interface MarketIndexRow {
  window: Window;
  basketUsersL: number;
  basketUsersP: number;
  deltaUsersPct: number;
  basketGetAppL: number;
  basketGetAppP: number;
  deltaGetAppPct: number;
  weightedL: number;
  weightedP: number;
  deltaWeightedPct: number;
  verdict: '📉 MARKET DOWN' | '⚠️ SOFT DECLINE' | '→ STABLE' | '📈 SOFT GROWTH' | '🚀 MARKET UP';
  primaryCause: string;
  causeDetails: string;
}

// === Funnel Breakdown (per window) ===
export interface FunnelBreakdown {
  window: Window;
  organic: { L: ChannelMetrics; P: ChannelMetrics };
  paid: { L: ChannelMetrics; P: ChannelMetrics };
  total: { L: { users: number; getapp: number }; P: { users: number; getapp: number } };
}
export interface ChannelMetrics {
  users: number;
  getapp: number;
  cr: number;       // 0-1 (decimal)
  pos: number | null;
}

// === All_* / Country_* row ===
export interface KeywordRow {
  category: Category;
  searchTerm: string;
  country?: string;       // present in Country_* tabs only
  surface: Surface;
  usersL: number;
  usersP: number;
  getAppL: number;
  getAppP: number;
  crL: number | null;
  crP: number | null;
  posL: number | null;
  posP: number | null;
  deltaPosPct: number | null;
  deltaUsersPct: number;
  deltaCrPct: number | null;
  alert: AlertType;
  lang: string;
  english: string;
}

// === L365 Snapshot row (no compare) ===
export interface SnapshotRow {
  category: Category;
  searchTerm: string;
  country?: string;
  surface: Surface;
  users: number;
  getApp: number;
  cr: number | null;
  pos: number | null;
  sharePct: number;
  lang: string;
  english: string;
}

// === History row ===
export interface HistoryRow {
  snapshotDate: string;  // ISO format
  searchTerm: string;
  surface: Surface;
  usersL7D: number;
  posL7D: number | null;
  alert: AlertType;
}

// === Local status (localStorage) ===
export interface RowStatus {
  rowKey: string;  // `${keyword}||${surface}||${country}||${window}`
  status: 'new' | 'in_progress' | 'done' | 'skipped' | 'snoozed';
  updatedAt: string;
  note?: string;
}
```

---

## 5. Parser Implementation (`lib/sheets/parsers.ts`)

**Key conventions to handle:**
- Row 1 = title (skip)
- Row 2 = headers (use to validate column order)
- Row 3 = TOTAL row (skip — first cell value is "TOTAL")
- Row 4+ = data

```typescript
import type { ActionQueueRow, KeywordRow, MarketIndexRow, ... } from './types';

const NUMBER_OR_NULL = (v: any): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

const PERCENT_TO_DECIMAL = (v: any): number => {
  if (typeof v === 'number') return v;  // already decimal from UNFORMATTED_VALUE
  if (typeof v === 'string') {
    const cleaned = v.replace('%', '').replace('+', '').trim();
    return Number(cleaned) / 100;
  }
  return 0;
};

export function parseActionQueue(rows: string[][]): ActionQueueRow[] {
  // Row 1 = title, Row 2 = headers, Row 3+ = data (no TOTAL row in Action_Queue)
  if (rows.length < 3) return [];
  return rows.slice(2).map(row => ({
    priority: row[0] as Priority,
    score: Number(row[1]) || 0,
    category: row[2] as Category,
    keyword: row[3],
    surface: row[4] as 'organic' | 'paid',
    country: row[5] || '(global)',
    window: row[6] as Window,
    alert: row[7] as AlertType,
    bidAction: row[8] as BidAction,
    bidSuggest: row[9] || '—',
    targetCamp: row[10],
    note: row[11],
    keyStats: row[12] || '',
  })).filter(r => r.keyword);
}

export function parseKeywordTab(rows: string[][], hasCountry: boolean): KeywordRow[] {
  // Row 1 = title, Row 2 = headers, Row 3 = TOTAL (skip), Row 4+ = data
  if (rows.length < 4) return [];
  const dataRows = rows.slice(3).filter(r => r[0] !== 'TOTAL' && r[1]);

  return dataRows.map(row => {
    let i = 0;
    const category = row[i++] as Category;
    const searchTerm = row[i++];
    const country = hasCountry ? row[i++] : undefined;
    const surface = row[i++] as Surface;
    return {
      category,
      searchTerm,
      country,
      surface,
      usersL: Number(row[i++]) || 0,
      usersP: Number(row[i++]) || 0,
      getAppL: Number(row[i++]) || 0,
      getAppP: Number(row[i++]) || 0,
      crL: NUMBER_OR_NULL(row[i++]),
      crP: NUMBER_OR_NULL(row[i++]),
      posL: NUMBER_OR_NULL(row[i++]),
      posP: NUMBER_OR_NULL(row[i++]),
      deltaPosPct: NUMBER_OR_NULL(row[i++]),
      deltaUsersPct: Number(row[i++]) || 0,
      deltaCrPct: NUMBER_OR_NULL(row[i++]),
      alert: (row[i++] || 'OK') as AlertType,
      lang: row[i++] || '',
      english: row[i++] || '',
    };
  });
}

export function parseMarketIndex(rows: string[][]): {
  summary: MarketIndexRow[];
  funnels: FunnelBreakdown[];
  narratives: Record<Window, string>;
} {
  // Section 2 starts row 3 (headers row 3, data row 4-8)
  // Section 3 (Funnel) starts after summary — variable position
  // Section 4 (Narrative) follows
  // Parser must scan for section markers like "▼ L7 FUNNEL BREAKDOWN"

  const summary: MarketIndexRow[] = [];
  const funnels: FunnelBreakdown[] = [];
  const narratives: Record<string, string> = {};

  let i = 3;  // start row 4 (0-indexed 3) for summary data

  // Parse summary (5 rows for L3, L7, L14, L30, L90)
  while (i < rows.length && rows[i] && ['L3', 'L7', 'L14', 'L30', 'L90'].includes(rows[i][0] as string)) {
    const r = rows[i];
    summary.push({
      window: r[0] as Window,
      basketUsersL: Number(r[1]) || 0,
      basketUsersP: Number(r[2]) || 0,
      deltaUsersPct: Number(r[3]) || 0,
      basketGetAppL: Number(r[4]) || 0,
      basketGetAppP: Number(r[5]) || 0,
      deltaGetAppPct: Number(r[6]) || 0,
      weightedL: Number(r[7]) || 0,
      weightedP: Number(r[8]) || 0,
      deltaWeightedPct: Number(r[9]) || 0,
      verdict: r[10] as any,
      primaryCause: r[11] || '',
      causeDetails: r[12] || '',
    });
    i++;
  }

  // Scan for funnel breakdowns (section header starts with "▼")
  while (i < rows.length) {
    const cell0 = rows[i]?.[0] || '';
    if (typeof cell0 === 'string' && cell0.includes('FUNNEL BREAKDOWN')) {
      const windowMatch = cell0.match(/▼ (L\d+)/);
      if (windowMatch) {
        const window = windowMatch[1] as Window;
        // Headers row at i+1, data rows i+2 to i+5
        const usersRow = rows[i + 2];
        const getAppRow = rows[i + 3];
        const crRow = rows[i + 4];
        const posRow = rows[i + 5];
        funnels.push({
          window,
          organic: {
            L: { users: Number(usersRow[1])||0, getapp: Number(getAppRow[1])||0, cr: Number(crRow[1])||0, pos: NUMBER_OR_NULL(posRow[1]) },
            P: { users: Number(usersRow[2])||0, getapp: Number(getAppRow[2])||0, cr: Number(crRow[2])||0, pos: NUMBER_OR_NULL(posRow[2]) },
          },
          paid: {
            L: { users: Number(usersRow[3])||0, getapp: Number(getAppRow[3])||0, cr: Number(crRow[3])||0, pos: NUMBER_OR_NULL(posRow[3]) },
            P: { users: Number(usersRow[4])||0, getapp: Number(getAppRow[4])||0, cr: Number(crRow[4])||0, pos: NUMBER_OR_NULL(posRow[4]) },
          },
          total: {
            L: { users: Number(usersRow[5])||0, getapp: Number(getAppRow[5])||0 },
            P: { users: Number(usersRow[6])||0, getapp: Number(getAppRow[6])||0 },
          },
        });
        i += 6;
        continue;
      }
    }
    // Scan for narrative section "[L7] Tuần L7: ..."
    if (typeof cell0 === 'string' && cell0.match(/^\[L\d+\]/)) {
      const windowMatch = cell0.match(/\[(L\d+)\]/);
      if (windowMatch) {
        narratives[windowMatch[1]] = (rows[i][1] as string) || '';
      }
    }
    i++;
  }

  return { summary, funnels, narratives: narratives as Record<Window, string> };
}

// Similar parsers for Tier1, Opportunity Lab, Snapshot, History...
```

---

## 6. API Routes

### 6.1 `/app/api/sheets/route.ts` — Fetch all tabs
```typescript
import { NextResponse } from 'next/server';
import { fetchAllTabs } from '@/lib/sheets/client';
import {
  parseActionQueue, parseKeywordTab, parseMarketIndex,
  parseTier1Watch, parseHistory, parseSnapshot
} from '@/lib/sheets/parsers';

export const revalidate = 3600;  // 1-hour ISR cache

export async function GET() {
  try {
    const rawTabs = await fetchAllTabs();
    const result = {
      actionQueue: parseActionQueue(rawTabs['Action_Queue']),
      marketIndex: parseMarketIndex(rawTabs['Market_Index']),
      tier1Watch: parseTier1Watch(rawTabs['Tier1_Market_Watch']),
      allL3: parseKeywordTab(rawTabs['All_L3'], false),
      allL7: parseKeywordTab(rawTabs['All_L7'], false),
      allL14: parseKeywordTab(rawTabs['All_L14'], false),
      allL30: parseKeywordTab(rawTabs['All_L30'], false),
      allL90: parseKeywordTab(rawTabs['All_L90'], false),
      countryL3: parseKeywordTab(rawTabs['Country_L3'], true),
      countryL7: parseKeywordTab(rawTabs['Country_L7'], true),
      countryL14: parseKeywordTab(rawTabs['Country_L14'], true),
      countryL30: parseKeywordTab(rawTabs['Country_L30'], true),
      countryL90: parseKeywordTab(rawTabs['Country_L90'], true),
      allL365: parseSnapshot(rawTabs['All_L365'], false),
      countryL365: parseSnapshot(rawTabs['Country_L365'], true),
      history: parseHistory(rawTabs['History']),
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err: any) {
    console.error('Sheets fetch failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

### 6.2 `/app/api/sheets/[tab]/route.ts` — Fetch single tab on demand
```typescript
import { NextResponse } from 'next/server';
import { fetchTab } from '@/lib/sheets/client';

export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: { tab: string } }) {
  try {
    const rows = await fetchTab(params.tab);
    return NextResponse.json({ rows, fetchedAt: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

---

## 7. Client-side data hook (`lib/hooks/useSheetData.ts`)

```typescript
import { useQuery } from '@tanstack/react-query';

export function useSheetData() {
  return useQuery({
    queryKey: ['sheet-data'],
    queryFn: async () => {
      const res = await fetch('/api/sheets');
      if (!res.ok) throw new Error('Failed to fetch sheet');
      return res.json();
    },
    staleTime: 60 * 60 * 1000,  // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
```

---

## 8. Color/Style Mappings (`lib/utils/colors.ts`)

```typescript
import type { Priority, AlertType, BidAction, Category } from '@/lib/sheets/types';

export const PRIORITY_STYLES: Record<Priority, { bg: string; text: string; label: string }> = {
  P0: { bg: 'bg-red-700', text: 'text-white', label: 'P0' },
  P1: { bg: 'bg-orange-500', text: 'text-white', label: 'P1' },
  P2: { bg: 'bg-yellow-300', text: 'text-black', label: 'P2' },
  P3: { bg: 'bg-gray-300', text: 'text-black', label: 'P3' },
};

export const ALERT_STYLES: Record<AlertType, { bg: string; text: string; bold: boolean }> = {
  '🚨 USER DROP + POS WORSEN': { bg: 'bg-red-700', text: 'text-white', bold: true },
  '⚠️ POSITION WORSEN':       { bg: 'bg-red-100', text: 'text-red-900', bold: true },
  '💔 INSTALL DROP':           { bg: 'bg-orange-500', text: 'text-white', bold: true },
  '💸 CR DROP':                { bg: 'bg-yellow-200', text: 'text-black', bold: true },
  '📉 USER DROP':              { bg: 'bg-yellow-100', text: 'text-black', bold: true },
  'OK':                        { bg: 'bg-gray-100', text: 'text-gray-700', bold: false },
  '🌱 user growth + pos improve': { bg: 'bg-green-700', text: 'text-white', bold: false },
  '📈 pos improve':            { bg: 'bg-green-100', text: 'text-green-900', bold: false },
  '❤️ install up':             { bg: 'bg-green-200', text: 'text-green-900', bold: false },
  '💚 cr improve':             { bg: 'bg-green-100', text: 'text-green-900', bold: false },
  '🚀 user growth':            { bg: 'bg-green-50', text: 'text-green-900', bold: false },
  '🎯 ORG STRONG, PAID MISSING': { bg: 'bg-blue-700', text: 'text-white', bold: true },
  '🎯 ORG STRONG, PAID WEAK':  { bg: 'bg-blue-500', text: 'text-white', bold: true },
  '🎯 ORG GOOD, POS LOW':      { bg: 'bg-teal-500', text: 'text-white', bold: false },
};

export const BID_ACTION_STYLES: Record<string, { bg: string; text: string; bold: boolean }> = {
  'PAUSE':            { bg: 'bg-red-700', text: 'text-white', bold: true },
  'NEGATIVE':         { bg: 'bg-orange-500', text: 'text-white', bold: true },
  'RAISE BID':        { bg: 'bg-green-700', text: 'text-white', bold: true },
  'RAISE BID PAID':   { bg: 'bg-green-800', text: 'text-white', bold: true },
  'EXPAND TO PAID':   { bg: 'bg-green-700', text: 'text-white', bold: true },
  'SCALE':            { bg: 'bg-green-700', text: 'text-white', bold: true },
  'REDUCE BID':       { bg: 'bg-yellow-200', text: 'text-black', bold: true },
  'REVIEW PAID BID':  { bg: 'bg-yellow-200', text: 'text-black', bold: true },
  'AUDIT KW':         { bg: 'bg-yellow-100', text: 'text-black', bold: false },
  'AUDIT MATCH TYPE': { bg: 'bg-yellow-100', text: 'text-black', bold: false },
  'REVIEW LISTING':   { bg: 'bg-red-100', text: 'text-red-900', bold: true },
  'CHECK LISTING':    { bg: 'bg-red-100', text: 'text-red-900', bold: false },
  'CHECK ORGANIC':    { bg: 'bg-gray-300', text: 'text-black', bold: false },
  'CHECK ORGANIC ALGO': { bg: 'bg-gray-300', text: 'text-black', bold: false },
  'HOLD':             { bg: 'bg-gray-100', text: 'text-gray-700', bold: false },
  'HOLD PAID':        { bg: 'bg-green-100', text: 'text-green-900', bold: false },
  'MONITOR':          { bg: 'bg-gray-100', text: 'text-gray-700', bold: false },
  'MONITOR ORGANIC':  { bg: 'bg-gray-100', text: 'text-gray-700', bold: false },
  'REVIEW':           { bg: 'bg-gray-100', text: 'text-gray-700', bold: false },
};

export const CATEGORY_STYLES: Record<Category, { bg: string; text: string; emoji: string }> = {
  'Brand':      { bg: 'bg-purple-100', text: 'text-purple-900', emoji: '🏷️' },
  'Competitor': { bg: 'bg-red-100', text: 'text-red-900', emoji: '⚔️' },
  'Profit':     { bg: 'bg-green-100', text: 'text-green-900', emoji: '💰' },
  'Feature':    { bg: 'bg-blue-100', text: 'text-blue-900', emoji: '⚙️' },
  'Language':   { bg: 'bg-indigo-100', text: 'text-indigo-900', emoji: '🌐' },
  'Others':     { bg: 'bg-amber-100', text: 'text-amber-900', emoji: '📦' },
  'CPM':        { bg: 'bg-pink-100', text: 'text-pink-900', emoji: '📢' },
  'Noise':      { bg: 'bg-gray-200', text: 'text-gray-700', emoji: '🗑️' },
  'Unknown':    { bg: 'bg-gray-100', text: 'text-gray-500', emoji: '❓' },
  'CatePage':   { bg: 'bg-cyan-100', text: 'text-cyan-900', emoji: '📑' },
  'Category':   { bg: 'bg-cyan-100', text: 'text-cyan-900', emoji: '📚' },
  'Test':       { bg: 'bg-yellow-100', text: 'text-yellow-900', emoji: '🧪' },
};

export const VERDICT_STYLES = {
  '📉 MARKET DOWN':  { bg: 'bg-red-700', text: 'text-white' },
  '⚠️ SOFT DECLINE': { bg: 'bg-red-100', text: 'text-red-900' },
  '→ STABLE':        { bg: 'bg-gray-100', text: 'text-gray-700' },
  '📈 SOFT GROWTH':  { bg: 'bg-green-100', text: 'text-green-900' },
  '🚀 MARKET UP':    { bg: 'bg-green-700', text: 'text-white' },
};
```

---

## 9. Key Components

### 9.1 ActionQueueRow.tsx
```typescript
'use client';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PriorityBadge } from './PriorityBadge';
import { AlertBadge } from './AlertBadge';
import { BidActionBadge } from './BidActionBadge';
import { CategoryChip } from '../shared/CategoryChip';
import { StatusDropdown } from './StatusDropdown';
import { useStatusStore } from '@/lib/store/statusStore';
import type { ActionQueueRow as Row } from '@/lib/sheets/types';

export function ActionQueueRow({ row }: { row: Row }) {
  const [expanded, setExpanded] = useState(false);
  const rowKey = `${row.keyword}||${row.surface}||${row.country}||${row.window}`;
  const status = useStatusStore(s => s.statuses[rowKey]?.status || 'new');

  return (
    <div className={`border-b transition-opacity ${status === 'done' ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
           onClick={() => setExpanded(!expanded)}>
        <Button variant="ghost" size="icon" className="h-5 w-5">
          {expanded ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}
        </Button>
        <PriorityBadge priority={row.priority} />
        <span className="text-xs text-gray-500 font-mono w-12">{row.score}</span>
        <CategoryChip category={row.category} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{row.keyword}</div>
          <div className="text-xs text-gray-500 flex gap-2">
            <span>{row.country}</span>
            <span>·</span>
            <span>{row.surface}</span>
            <span>·</span>
            <span>{row.window}</span>
          </div>
        </div>
        <AlertBadge alert={row.alert} />
        <BidActionBadge action={row.bidAction} suggest={row.bidSuggest} />
        <StatusDropdown rowKey={rowKey} />
      </div>
      {expanded && (
        <div className="p-4 pl-12 bg-gray-50 text-sm space-y-2">
          <div>
            <span className="font-semibold">Target Camp:</span>{' '}
            <code className="bg-white px-2 py-0.5 rounded">{row.targetCamp}</code>
          </div>
          <div>
            <span className="font-semibold">Note:</span> {row.note}
          </div>
          <div className="text-xs text-gray-600">
            <span className="font-semibold">Key Stats:</span> {row.keyStats}
          </div>
        </div>
      )}
    </div>
  );
}
```

### 9.2 MarketIndexCards.tsx
```typescript
'use client';
import { WindowCard } from './WindowCard';
import { FunnelBreakdown } from './FunnelBreakdown';
import { NarrativePanel } from './NarrativePanel';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { useState } from 'react';

export function MarketIndexCards() {
  const { data, isLoading } = useSheetData();
  const [selectedWindow, setSelectedWindow] = useState<string | null>(null);

  if (isLoading) return <div>Loading Market Index...</div>;

  const { summary, funnels, narratives } = data.marketIndex;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">Market Health</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {summary.map(row => (
          <WindowCard
            key={row.window}
            row={row}
            isSelected={selectedWindow === row.window}
            onClick={() => setSelectedWindow(row.window === selectedWindow ? null : row.window)}
          />
        ))}
      </div>
      {selectedWindow && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FunnelBreakdown
            funnel={funnels.find(f => f.window === selectedWindow)}
          />
          <NarrativePanel
            window={selectedWindow}
            narrative={narratives[selectedWindow]}
          />
        </div>
      )}
    </section>
  );
}
```

---

## 10. Local Storage Store (`lib/store/statusStore.ts`)

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface StatusState {
  statuses: Record<string, { status: string; updatedAt: string; note?: string }>;
  setStatus: (rowKey: string, status: string) => void;
  setNote: (rowKey: string, note: string) => void;
  clearAll: () => void;
}

export const useStatusStore = create<StatusState>()(
  persist(
    (set) => ({
      statuses: {},
      setStatus: (rowKey, status) => set(s => ({
        statuses: { ...s.statuses, [rowKey]: {
          ...s.statuses[rowKey],
          status,
          updatedAt: new Date().toISOString(),
        }},
      })),
      setNote: (rowKey, note) => set(s => ({
        statuses: { ...s.statuses, [rowKey]: {
          ...s.statuses[rowKey],
          status: s.statuses[rowKey]?.status || 'new',
          updatedAt: new Date().toISOString(),
          note,
        }},
      })),
      clearAll: () => set({ statuses: {} }),
    }),
    { name: 'aso-status-storage' }
  )
);
```

---

## 11. Routes Map

| Route | Component | Story coverage |
|---|---|---|
| `/` | ActionQueuePage | 1.1, 1.2, 5.1 |
| `/market-index` | MarketIndexPage | 1.2, 2.1 |
| `/geo-opportunity` | GeoOpportunityPage | 3.1, 3.2 |
| `/tier1-watch` | Tier1WatchPage | 2.2 |
| `/category/[name]` | CategoryDrilldownPage | 2.3 |
| `/keyword/[term]` | KeywordTrendPage | 4.1 |
| `/trends` | TrendsOverviewPage | 4.2 |

---

## 12. Setup Commands (for Claude Code to run)

```bash
# 1. Init
npx create-next-app@latest trueprofit-aso-dashboard --typescript --tailwind --app --src-dir=false --import-alias="@/*"
cd trueprofit-aso-dashboard

# 2. Install deps
npm install googleapis @tanstack/react-query zustand recharts lucide-react date-fns class-variance-authority clsx tailwind-merge

# 3. Init shadcn
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card badge tabs select dropdown-menu input table dialog sheet command tooltip popover scroll-area separator skeleton

# 4. Create .env.local with service account creds (template above)

# 5. Run dev
npm run dev
```

---

## 13. Implementation Order (Phase 1 MVP)

**Day 1-2: Foundation**
1. Init project + install deps
2. Set up shadcn/ui base components
3. Create types in `lib/sheets/types.ts`
4. Implement `lib/sheets/client.ts` (Google Sheets API)
5. Test API connection with a single tab fetch via `/api/sheets/Action_Queue`

**Day 3-4: Action Queue (Story 1.1)**
6. Implement `parseActionQueue` parser
7. Create `useSheetData` hook with React Query
8. Build `ActionQueueTable` + `ActionQueueRow` + `PriorityBadge` + `AlertBadge` + `BidActionBadge`
9. Implement filters (Priority, Category, Surface, Country, Alert type)
10. Implement search box (filter by keyword text)
11. Implement Status dropdown + Zustand persist

**Day 5-6: Market Index (Story 1.2 + 2.1)**
12. Implement `parseMarketIndex` parser (handle 3 sections)
13. Build `MarketIndexCards` (5 KPI cards)
14. Build `FunnelBreakdown` (table organic vs paid)
15. Build `NarrativePanel` (Vietnamese text card)

**Day 7: Geo Opportunity (Story 3.1)**
16. Build `/geo-opportunity` page
17. Filter alerts where alert starts with 🎯
18. Group by Country with collapsible sections
19. Show suggested camp + bid range per row

**Day 8: Polish + Deploy**
20. Mobile responsive testing
21. Loading skeletons for slow fetches
22. Error boundary + retry button
23. Deploy to Vercel
24. Test with real sheet data
25. Handover to Trang

---

## 14. Testing Checklist (before handover)

- [ ] Sheet API fetch works (verify with `console.log` data shape matches types)
- [ ] Action Queue shows 50 rows sorted by Priority desc
- [ ] Filters reset properly when changing tab
- [ ] URL params persist filter state (refresh page → same view)
- [ ] Market Index 5 cards display correctly
- [ ] Click Window card → expand Funnel + Narrative
- [ ] Geo Opportunity groups by Country with correct alerts
- [ ] Status dropdown changes persist after page reload (localStorage)
- [ ] Mobile viewport (375px) — Action Queue still scannable
- [ ] Dark mode (if implemented) — all badges legible
- [ ] CSV export from Geo Opportunity tab works
- [ ] Error state: sheet API down → show retry button, no white screen
- [ ] Loading state: skeletons display, no layout shift

---

## 15. Out of Scope Reminders (DO NOT BUILD)

- ❌ Write back to Google Sheets (read-only)
- ❌ Multi-user authentication / accounts
- ❌ Real-time websocket updates
- ❌ Shopify Ads direct integration
- ❌ ML predictions beyond what's in sheet
- ❌ Mobile native app
- ❌ Internationalization (Vietnamese hardcoded fine)

---

## 16. Open Questions Claude Code Should Answer Before Building

1. **Caching strategy:** Should I use Next.js ISR (1-hour revalidate) or client-side React Query stale-while-revalidate? → **Both. ISR on /api/sheets, RQ on client.**
2. **Service account or OAuth:** Service account simpler since single-user. → **Service account.**
3. **Database:** Do we need any DB? → **No, localStorage + Zustand persist enough for v1.**
4. **Auth gating:** Should the dashboard URL be public or require login? → **Deploy with Vercel password protection OR a simple session cookie. Phase 1 acceptable without auth if URL is private.**
5. **Analytics:** Track dashboard usage? → **No for v1.**

---

## 17. Reference Material

**Files to read first:**
- `Code.gs` (in same dir) — understand exact data shape per tab
- `USER_STORY_DASHBOARD.md` — business context, persona, user stories
- Example sheet export `.xlsx` (if provided) — see real values

**Apps Script generates the sheet daily.** Dashboard is a read-only consumer. **Do not modify the Apps Script flow.**

---

## 18. Domain Rules — Critical Reminders

1. **Surface = `search`** means organic — **NEVER suggest bid action** for these. Show only `EXPAND TO PAID`, `RAISE BID PAID`, `CHECK LISTING`, etc.
2. **Surface = `search_ad`** means paid — show full bid actions.
3. **🎯 ORG STRONG, PAID MISSING** = paid hasn't bid that (kw × country) in last 90+30 days. Action: EXPAND TO PAID.
4. **🎯 ORG STRONG, PAID WEAK** = paid bid but Pos > 3. Action: RAISE BID PAID +20-30%.
5. **CPI hard cap = $33**. Tier 1/2 tolerance up to $30. Blended target ≤ $19.
6. **Vietnamese register:** informal, "mày" tone in any user-facing copy where Trang's the user. UI labels can stay English.
7. **Category order (Brand → Competitor → Profit → Feature → Language → Others → CPM → Noise → Unknown)** is the canonical sort. Maintain this everywhere.
