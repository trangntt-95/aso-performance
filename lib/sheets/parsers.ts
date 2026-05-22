import type {
  ActionQueueRow,
  AlertLogRow,
  AlertType,
  BidAction,
  Category,
  DynamicBasketItem,
  ExecutiveSummary,
  FunnelBreakdown,
  HistoryDailyRow,
  HistoryRow,
  KeywordRow,
  MarketIndexData,
  MarketIndexSummaryRow,
  Priority,
  SnapshotRow,
  Surface,
  Tier1WatchRow,
  Verdict,
  Window,
  WowMetric,
} from './types';

// ---------------------------------------------------------------------------
// Cell coercions
// ---------------------------------------------------------------------------

const numOrNull = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const num = (v: unknown): number => numOrNull(v) ?? 0;

const str = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  return String(v);
};

const isWindowKey = (v: unknown): v is Window =>
  ['L3', 'L7', 'L14', 'L30', 'L90', 'L365', 'L90+L30'].includes(String(v));

const toSurfaceLabel = (raw: unknown): 'organic' | 'paid' => {
  const v = str(raw).toLowerCase();
  return v === 'paid' || v === 'search_ad' ? 'paid' : 'organic';
};

const toSurface = (raw: unknown): Surface => {
  const v = str(raw).toLowerCase();
  return v === 'paid' || v === 'search_ad' ? 'search_ad' : 'search';
};

// ---------------------------------------------------------------------------
// Action_Queue
// Row 1 = title, Row 2 = headers, Row 3+ = data (no TOTAL row).
// ---------------------------------------------------------------------------

export function parseActionQueue(rows: string[][]): ActionQueueRow[] {
  if (!rows || rows.length < 3) return [];
  return rows
    .slice(2)
    .map((row): ActionQueueRow | null => {
      const keyword = str(row[3]);
      if (!keyword || keyword === 'TOTAL') return null;
      return {
        priority: (str(row[0]) || 'P3') as Priority,
        score: num(row[1]),
        category: (str(row[2]) || 'Unknown') as Category,
        keyword,
        surface: toSurfaceLabel(row[4]),
        country: str(row[5]) || '(global)',
        window: (str(row[6]) || 'L7') as Window,
        alert: (str(row[7]) || 'OK') as AlertType,
        bidAction: (str(row[8]) || 'REVIEW') as BidAction,
        bidSuggest: str(row[9]) || '—',
        targetCamp: str(row[10]),
        note: str(row[11]),
        keyStats: str(row[12]),
      };
    })
    .filter((r): r is ActionQueueRow => r !== null);
}

// ---------------------------------------------------------------------------
// All_* / Country_* (windowed compare tabs)
// Row 1 = title, Row 2 = headers, Row 3 = TOTAL (skip), Row 4+ = data.
// ---------------------------------------------------------------------------

export function parseKeywordTab(rows: string[][], hasCountry: boolean): KeywordRow[] {
  if (!rows || rows.length < 4) return [];
  return rows
    .slice(3)
    .map((row): KeywordRow | null => {
      if (!row || row.length === 0) return null;
      if (str(row[0]).toUpperCase() === 'TOTAL') return null;

      let i = 0;
      const category = (str(row[i++]) || 'Unknown') as Category;
      const searchTerm = str(row[i++]);
      if (!searchTerm) return null;
      const country = hasCountry ? str(row[i++]) || undefined : undefined;
      const surface = toSurface(row[i++]);

      return {
        category,
        searchTerm,
        country,
        surface,
        usersL: num(row[i++]),
        usersP: num(row[i++]),
        getAppL: num(row[i++]),
        getAppP: num(row[i++]),
        crL: numOrNull(row[i++]),
        crP: numOrNull(row[i++]),
        posL: numOrNull(row[i++]),
        posP: numOrNull(row[i++]),
        deltaPosPct: numOrNull(row[i++]),
        deltaUsersPct: num(row[i++]),
        deltaCrPct: numOrNull(row[i++]),
        alert: (str(row[i++]) || 'OK') as AlertType,
        lang: str(row[i++]),
        english: str(row[i++]),
      };
    })
    .filter((r): r is KeywordRow => r !== null);
}

// ---------------------------------------------------------------------------
// All_L365 / Country_L365 (snapshot — no compare cols)
// ---------------------------------------------------------------------------

export function parseSnapshot(rows: string[][], hasCountry: boolean): SnapshotRow[] {
  if (!rows || rows.length < 4) return [];
  return rows
    .slice(3)
    .map((row): SnapshotRow | null => {
      if (!row || row.length === 0) return null;
      if (str(row[0]).toUpperCase() === 'TOTAL') return null;

      let i = 0;
      const category = (str(row[i++]) || 'Unknown') as Category;
      const searchTerm = str(row[i++]);
      if (!searchTerm) return null;
      const country = hasCountry ? str(row[i++]) || undefined : undefined;
      const surface = toSurface(row[i++]);
      return {
        category,
        searchTerm,
        country,
        surface,
        users: num(row[i++]),
        getApp: num(row[i++]),
        cr: numOrNull(row[i++]),
        pos: numOrNull(row[i++]),
        sharePct: num(row[i++]),
        lang: str(row[i++]),
        english: str(row[i++]),
      };
    })
    .filter((r): r is SnapshotRow => r !== null);
}

// ---------------------------------------------------------------------------
// Market_Index — has 3 sections: summary, funnel breakdowns, narratives.
// Heuristic parser, tolerant to position drift.
// ---------------------------------------------------------------------------

const SUMMARY_WINDOWS: Window[] = ['L3', 'L7', 'L14', 'L30', 'L90'];

function parseExecSummary(rows: string[][]): ExecutiveSummary | undefined {
  const startIdx = rows.findIndex((r) => str(r?.[0]).includes('EXECUTIVE SUMMARY'));
  if (startIdx === -1) return undefined;
  const out: ExecutiveSummary = {};
  for (let i = startIdx + 1; i < Math.min(rows.length, startIdx + 20); i++) {
    const r = rows[i] || [];
    const k = str(r[0]).trim();
    if (!k) continue;
    if (k.startsWith('🎯') || k.includes('COMPARISON') || k.includes('VERDICT')) break;
    if (k === 'overall_health') {
      out.overallHealth = { value: str(r[1]), visual: str(r[2]), status: str(r[3]) };
    } else if (k === 'trend_sparkline_L3_to_L90') {
      out.trendSparkline = str(r[1]);
    } else if (k === 'top_concern') {
      out.topConcern = { value: str(r[1]), status: str(r[3]) };
    } else if (k === 'top_opportunity') {
      out.topOpportunity = { value: str(r[1]), status: str(r[3]) };
    } else if (k === 'install_per_day_L7') {
      out.installPerDayL7 = num(r[1]);
      out.installTargetText = str(r[2]);
    } else if (k === 'install_vs_target') {
      out.installVsTarget = num(r[1]);
      out.installPacingVisual = str(r[2]);
      out.installPacingStatus = str(r[3]);
    } else if (k === 'quarter_install_target_range') {
      out.quarterTargetText = str(r[1]);
      out.cpiTargetText = str(r[2]);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseWow(rows: string[][]): WowMetric[] {
  const startIdx = rows.findIndex((r) => str(r?.[0]).includes('WoW COMPARISON'));
  if (startIdx === -1) return [];
  const out: WowMetric[] = [];
  for (let i = startIdx + 2; i < Math.min(rows.length, startIdx + 12); i++) {
    const r = rows[i] || [];
    const metric = str(r[0]).trim();
    if (!metric || metric === 'Metric') continue;
    if (metric.startsWith('📊') || metric.includes('VERDICT') || metric.includes('FUNNEL')) break;
    out.push({
      metric,
      thisPeriod: num(r[1]),
      lastPeriod: num(r[2]),
      deltaValue: num(r[3]),
      deltaPct: num(r[4]),
      status: str(r[6]),
    });
  }
  return out;
}

function parseBasket(rows: string[][]): DynamicBasketItem[] {
  const startIdx = rows.findIndex((r) => str(r?.[0]).includes('Dynamic Basket'));
  if (startIdx === -1) return [];
  const out: DynamicBasketItem[] = [];
  for (let i = startIdx + 2; i < Math.min(rows.length, startIdx + 15); i++) {
    const r = rows[i] || [];
    const rank = Number(r[0]);
    const term = str(r[1]).trim();
    if (!Number.isFinite(rank) || rank <= 0 || !term) break;
    out.push({
      rank,
      searchTerm: term,
      l90Users: num(r[2]),
    });
  }
  return out;
}

export function parseMarketIndex(rows: string[][]): MarketIndexData {
  const summary: MarketIndexSummaryRow[] = [];
  const funnels: FunnelBreakdown[] = [];
  const narratives: Partial<Record<Window, string>> = {};
  if (!rows || rows.length === 0) {
    return { summary, funnels, narratives, wow: [], basket: [] };
  }

  let i = 0;
  while (i < rows.length) {
    const r = rows[i] || [];
    const cell0 = str(r[0]);

    if (SUMMARY_WINDOWS.includes(cell0 as Window)) {
      summary.push({
        window: cell0 as Window,
        basketUsersL: num(r[1]),
        basketUsersP: num(r[2]),
        deltaUsersPct: num(r[3]),
        basketGetAppL: num(r[4]),
        basketGetAppP: num(r[5]),
        deltaGetAppPct: num(r[6]),
        weightedL: num(r[7]),
        weightedP: num(r[8]),
        deltaWeightedPct: num(r[9]),
        verdict: (str(r[10]) || '→ STABLE') as Verdict,
        primaryCause: str(r[11]),
        causeDetails: str(r[12]),
      });
      i++;
      continue;
    }

    if (cell0.includes('FUNNEL BREAKDOWN')) {
      const m = cell0.match(/(L\d+)/);
      if (m && isWindowKey(m[1])) {
        const w = m[1] as Window;
        const usersRow = rows[i + 2] || [];
        const getAppRow = rows[i + 3] || [];
        const crRow = rows[i + 4] || [];
        const posRow = rows[i + 5] || [];
        funnels.push({
          window: w,
          organic: {
            L: { users: num(usersRow[1]), getapp: num(getAppRow[1]), cr: num(crRow[1]), pos: numOrNull(posRow[1]) },
            P: { users: num(usersRow[2]), getapp: num(getAppRow[2]), cr: num(crRow[2]), pos: numOrNull(posRow[2]) },
          },
          paid: {
            L: { users: num(usersRow[3]), getapp: num(getAppRow[3]), cr: num(crRow[3]), pos: numOrNull(posRow[3]) },
            P: { users: num(usersRow[4]), getapp: num(getAppRow[4]), cr: num(crRow[4]), pos: numOrNull(posRow[4]) },
          },
          total: {
            L: { users: num(usersRow[5]), getapp: num(getAppRow[5]) },
            P: { users: num(usersRow[6]), getapp: num(getAppRow[6]) },
          },
        });
        i += 6;
        continue;
      }
    }

    const narrativeMatch = cell0.match(/^\[(L\d+)\]/);
    if (narrativeMatch && isWindowKey(narrativeMatch[1])) {
      const w = narrativeMatch[1] as Window;
      narratives[w] = str(r[1]) || cell0.replace(/^\[L\d+\]\s*/, '');
    }

    i++;
  }

  return {
    summary,
    funnels,
    narratives,
    executiveSummary: parseExecSummary(rows),
    wow: parseWow(rows),
    basket: parseBasket(rows),
  };
}

// ---------------------------------------------------------------------------
// Tier1_Market_Watch — heuristic, multiple windowed sections.
// Falls back to a flat parse if section markers absent.
// ---------------------------------------------------------------------------

export function parseTier1Watch(rows: string[][]): Tier1WatchRow[] {
  if (!rows || rows.length < 3) return [];
  const out: Tier1WatchRow[] = [];
  let currentWindow: Window = 'L7';

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] || [];
    const cell0 = str(r[0]);

    const winMatch = cell0.match(/(L\d+)/);
    if (winMatch && isWindowKey(winMatch[1]) && r.length <= 3) {
      currentWindow = winMatch[1] as Window;
      continue;
    }

    if (!cell0 || cell0.toUpperCase() === 'TOTAL' || cell0 === 'Category') continue;
    const searchTerm = str(r[1]);
    if (!searchTerm || searchTerm === 'Search Term') continue;
    const country = str(r[2]);
    if (!country || country === 'Country') continue;
    const surface = toSurface(r[3]);

    out.push({
      category: (cell0 || 'Unknown') as Category,
      searchTerm,
      country,
      surface,
      window: currentWindow,
      usersL: num(r[4]),
      usersP: num(r[5]),
      deltaUsersPct: num(r[6]),
      posL: numOrNull(r[7]),
      posP: numOrNull(r[8]),
      alert: (str(r[9]) || 'OK') as AlertType,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// History — append-only weekly snapshots.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AlertLog — append-only daily rank-drop alerts (written by Apps Script).
// Header: snapshot_date | keyword | country | window | surface |
//         pos_prior | pos_latest | delta_pos | users_l |
//         top_contrib_windows | email_sent
// ---------------------------------------------------------------------------

export function parseAlertLog(rows: string[][]): AlertLogRow[] {
  if (!rows || rows.length < 2) return [];
  return rows
    .slice(1)
    .map((row): AlertLogRow | null => {
      if (!row || row.length === 0) return null;
      const rawDate = row[0];
      const keyword = str(row[1]);
      if (rawDate === undefined || rawDate === null || rawDate === '' || !keyword) return null;
      return {
        snapshotDate: typeof rawDate === 'number' ? rawDate : str(rawDate),
        keyword,
        country: str(row[2]),
        window: str(row[3]),
        surface: str(row[4]),
        posP: numOrNull(row[5]),
        posL: numOrNull(row[6]),
        deltaPos: numOrNull(row[7]),
        usersL: num(row[8]),
        topContribWindows: str(row[9]),
        emailSent: String(row[10] ?? '').toLowerCase() === 'true',
      };
    })
    .filter((r): r is AlertLogRow => r !== null);
}

// ---------------------------------------------------------------------------
// History_Daily — daily snapshot of users + getApp + cr + pos (per keyword × surface).
// Schema: date | searchTerm | surface | usersL7D | getAppL7D | crL7D | posL7D
// Row 1 = headers, row 2+ = data.
// ---------------------------------------------------------------------------

export function parseHistoryDaily(rows: string[][]): HistoryDailyRow[] {
  if (!rows || rows.length < 2) return [];
  return rows
    .slice(1)
    .map((row): HistoryDailyRow | null => {
      if (!row || row.length === 0) return null;
      const rawDate = row[0];
      const searchTerm = str(row[1]);
      if (rawDate === undefined || rawDate === null || rawDate === '' || !searchTerm) return null;
      const dateNumeric = typeof rawDate === 'number' ? rawDate : Number(rawDate);
      const looksLikeDate =
        (Number.isFinite(dateNumeric) && dateNumeric > 20000 && dateNumeric < 90000) ||
        /^\d{4}-\d{2}-\d{2}/.test(str(rawDate));
      if (!looksLikeDate) return null;
      return {
        snapshotDate: typeof rawDate === 'number' ? rawDate : str(rawDate),
        searchTerm,
        surface: toSurface(row[2]),
        usersL7D: num(row[3]),
        getAppL7D: numOrNull(row[4]),
        crL7D: numOrNull(row[5]),
        posL7D: numOrNull(row[6]),
        usersDaily: numOrNull(row[7]),
        getAppDaily: numOrNull(row[8]),
        crDaily: numOrNull(row[9]),
        posDaily: numOrNull(row[10]),
        source: str(row[11]),
      };
    })
    .filter((r): r is HistoryDailyRow => r !== null);
}

export function parseHistory(rows: string[][]): HistoryRow[] {
  if (!rows || rows.length === 0) return [];
  return rows
    .map((row): HistoryRow | null => {
      if (!row || row.length === 0) return null;
      const rawDate = row[0];
      const searchTerm = str(row[1]);
      if (rawDate === undefined || rawDate === null || rawDate === '' || !searchTerm) return null;
      // Skip header rows: cell[0] must be a numeric date serial or ISO date string
      const dateNumeric = typeof rawDate === 'number' ? rawDate : Number(rawDate);
      const looksLikeDate =
        (Number.isFinite(dateNumeric) && dateNumeric > 20000 && dateNumeric < 90000) ||
        /^\d{4}-\d{2}-\d{2}/.test(str(rawDate));
      if (!looksLikeDate) return null;
      const surface = toSurface(row[2]);
      return {
        snapshotDate: typeof rawDate === 'number' ? rawDate : str(rawDate),
        searchTerm,
        surface,
        usersL7D: num(row[3]),
        posL7D: numOrNull(row[4]),
        alert: (str(row[5]) || 'OK') as AlertType,
      };
    })
    .filter((r): r is HistoryRow => r !== null);
}
