import type {
  ActionQueueRow,
  AlertLogRow,
  AlertType,
  BidAction,
  BidCapRow,
  CampLinkRow,
  Category,
  DynamicBasketItem,
  ExecutiveSummary,
  FunnelBreakdown,
  HistoryDailyRow,
  HistoryRow,
  KeywordRow,
  KwAddedManualRow,
  MarketIndexData,
  MarketIndexSummaryRow,
  MasterKwRow,
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

// Reclassify any non-English keyword as 'Language'. Apps Script classify rule
// occasionally tags foreign-language terms (e.g. "größe", "trueprofit ทรโปรฟต")
// as Feature/Brand/Profit/Others. Two reliable signals:
// 1. Any non-ASCII char in the search term (covers Thai/Chinese/Turkish/accented
//    Latin like ç, ñ, ö, ß, é etc.)
// 2. Explicit `lang` column non-empty and ≠ 'en'.
// We INTENTIONALLY do not use the `english` translation column because Apps
// Script also fills it for English typos (e.g. "proft" → "prophet", "trueprfot"
// → "trueprfoot") which would over-trigger. The 8 ASCII non-English misses
// (steuern, finanze, finanzen, inventario, analitica, analiza, analiz, cashflow)
// are caught downstream via the Master KW Lookup override in api/sheets/route.ts.
const NON_ASCII_RE = /[^\x00-\x7F]/;
const normalizeForeignToLanguage = (
  category: Category,
  searchTerm: string,
  lang: string,
): Category => {
  if (NON_ASCII_RE.test(searchTerm)) return 'Language' as Category;
  const l = lang.trim().toLowerCase();
  if (l !== '' && l !== 'en') return 'Language' as Category;
  return category;
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

// Keywords that differ only by letter case (App Store search is case-insensitive,
// e.g. "profit" vs "Profit") are the same term — merge them into one row so the
// whole app treats them as one (no duplicate list entries / filters). Rows that
// have no case-twin are returned untouched so the sheet's precomputed deltas are
// preserved exactly; only genuinely merged groups get recomputed deltas.
function mergeCaseVariants(rows: KeywordRow[]): KeywordRow[] {
  const groups = new Map<string, KeywordRow[]>();
  for (const r of rows) {
    const key = `${r.category}|${r.country ?? ''}|${r.surface}|${r.searchTerm.toLowerCase()}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const out: KeywordRow[] = [];
  for (const group of Array.from(groups.values())) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    // Canonical label = the casing with the most users (dominant variant).
    const canonical = [...group].sort((a, b) => b.usersL - a.usersL)[0];
    const usersL = group.reduce((s, r) => s + r.usersL, 0);
    const usersP = group.reduce((s, r) => s + r.usersP, 0);
    const getAppL = group.reduce((s, r) => s + r.getAppL, 0);
    const getAppP = group.reduce((s, r) => s + r.getAppP, 0);
    // Position = users-weighted average (fall back to simple average if no users).
    const wPos = (key: 'posL' | 'posP', wKey: 'usersL' | 'usersP') => {
      const withPos = group.filter((r) => r[key] !== null);
      if (withPos.length === 0) return null;
      const wSum = withPos.reduce((s, r) => s + r[wKey], 0);
      if (wSum > 0) return withPos.reduce((s, r) => s + (r[key] as number) * r[wKey], 0) / wSum;
      return withPos.reduce((s, r) => s + (r[key] as number), 0) / withPos.length;
    };
    const posL = wPos('posL', 'usersL');
    const posP = wPos('posP', 'usersP');
    const crL = usersL > 0 ? getAppL / usersL : null;
    const crP = usersP > 0 ? getAppP / usersP : null;
    // Most severe alert wins (first non-OK), else OK.
    const alert = group.find((r) => r.alert && r.alert !== 'OK')?.alert ?? 'OK';

    out.push({
      category: canonical.category,
      searchTerm: canonical.searchTerm,
      country: canonical.country,
      surface: canonical.surface,
      usersL,
      usersP,
      getAppL,
      getAppP,
      crL,
      crP,
      posL,
      posP,
      deltaPosPct: posP && posP !== 0 && posL !== null ? (posL - posP) / posP : null,
      deltaUsersPct: usersP > 0 ? (usersL - usersP) / usersP : 0,
      deltaCrPct: crP && crP !== 0 && crL !== null ? (crL - crP) / crP : null,
      alert: alert as AlertType,
      lang: canonical.lang,
      english: canonical.english,
    });
  }
  return out;
}

export function parseKeywordTab(rows: string[][], hasCountry: boolean): KeywordRow[] {
  if (!rows || rows.length < 4) return [];
  const parsed = rows
    .slice(3)
    .map((row): KeywordRow | null => {
      if (!row || row.length === 0) return null;
      if (str(row[0]).toUpperCase() === 'TOTAL') return null;

      let i = 0;
      const rawCategory = (str(row[i++]) || 'Unknown') as Category;
      const searchTerm = str(row[i++]);
      if (!searchTerm) return null;
      const country = hasCountry ? str(row[i++]) || undefined : undefined;
      const surface = toSurface(row[i++]);
      const usersL = num(row[i++]);
      const usersP = num(row[i++]);
      const getAppL = num(row[i++]);
      const getAppP = num(row[i++]);
      const crL = numOrNull(row[i++]);
      const crP = numOrNull(row[i++]);
      const posL = numOrNull(row[i++]);
      const posP = numOrNull(row[i++]);
      const deltaPosPct = numOrNull(row[i++]);
      const deltaUsersPct = num(row[i++]);
      const deltaCrPct = numOrNull(row[i++]);
      const alert = (str(row[i++]) || 'OK') as AlertType;
      const lang = str(row[i++]);
      const english = str(row[i++]);

      return {
        category: normalizeForeignToLanguage(rawCategory, searchTerm, lang),
        searchTerm,
        country,
        surface,
        usersL,
        usersP,
        getAppL,
        getAppP,
        crL,
        crP,
        posL,
        posP,
        deltaPosPct,
        deltaUsersPct,
        deltaCrPct,
        alert,
        lang,
        english,
      };
    })
    .filter((r): r is KeywordRow => r !== null);

  return mergeCaseVariants(parsed);
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
      const rawCategory = (str(row[i++]) || 'Unknown') as Category;
      const searchTerm = str(row[i++]);
      if (!searchTerm) return null;
      const country = hasCountry ? str(row[i++]) || undefined : undefined;
      const surface = toSurface(row[i++]);
      const users = num(row[i++]);
      const getApp = num(row[i++]);
      const cr = numOrNull(row[i++]);
      const pos = numOrNull(row[i++]);
      const sharePct = num(row[i++]);
      const lang = str(row[i++]);
      const english = str(row[i++]);
      return {
        category: normalizeForeignToLanguage(rawCategory, searchTerm, lang),
        searchTerm,
        country,
        surface,
        users,
        getApp,
        cr,
        pos,
        sharePct,
        lang,
        english,
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
// Window date range — parsed from the All_Lx title row written by the Apps
// Script, e.g. "ALL_L30 — L30D: 2026-05-04 → 2026-06-02 vs P30D: ...".
// First date pair = the current (L) period the report actually covers.
// ---------------------------------------------------------------------------

export function parseWindowDateRange(rows: string[][]): { from: string; to: string } | null {
  const title = rows?.[0]?.[0];
  if (title === undefined || title === null) return null;
  // First two ISO dates in the title = the current (L) period start → end.
  const m = /(\d{4}-\d{2}-\d{2})\D+?(\d{4}-\d{2}-\d{2})/.exec(String(title));
  return m ? { from: m[1], to: m[2] } : null;
}

// ---------------------------------------------------------------------------
// KW_Added_Manual — manually tracked keywords newly added to paid campaigns.
// Used as a fallback "in paid" signal for keywords that haven't yet surfaced
// in Country_L365 (fresh adds, low impression count, etc.).
// Header: Keyword | Camp | Ghi chú / ngày thêm
// ---------------------------------------------------------------------------

export function parseKwAddedManual(rows: string[][]): KwAddedManualRow[] {
  if (!rows || rows.length < 2) return [];
  return rows
    .slice(1)
    .map((row): KwAddedManualRow | null => {
      const keyword = str(row?.[0]).trim();
      if (!keyword) return null;
      return {
        keyword,
        camp: str(row[1]).trim(),
        note: str(row[2]).trim(),
      };
    })
    .filter((r): r is KwAddedManualRow => r !== null);
}

// ---------------------------------------------------------------------------
// Master KW Lookup — master list of every keyword bid in paid campaigns.
// Row 0 = title, row 1 = usage note, row 2 = header, row 3+ = data.
// Header: Category | Camp Name | KW | Match Types | Bid (max) | Impressions |
//         Clicks | Installs | Classification
// ---------------------------------------------------------------------------

export function parseMasterKw(rows: string[][]): MasterKwRow[] {
  if (!rows || rows.length < 4) return [];
  // Locate the header row (column 0 == 'Category' and column 2 == 'KW'),
  // then take everything after it. Defensive against Trang re-ordering top notes.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (str(rows[i]?.[0]).trim() === 'Category' && str(rows[i]?.[2]).trim() === 'KW') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];
  return rows
    .slice(headerIdx + 1)
    .map((row): MasterKwRow | null => {
      const keyword = str(row?.[2]).trim();
      if (!keyword) return null;
      return {
        category: str(row[0]).trim(),
        camp: str(row[1]).trim(),
        keyword,
        matchType: str(row[3]).trim(),
        bidMax: str(row[4]).trim(),
        impressions: num(row[5]),
        clicks: num(row[6]),
        installs: num(row[7]),
        classification: str(row[8]).trim(),
      };
    })
    .filter((r): r is MasterKwRow => r !== null);
}

// ---------------------------------------------------------------------------
// Max bid cap — one recommended bid per Country × Category, computed by Apps
// Script. Row 0 = header, row 1+ = data. Columns mapped by header NAME (not
// fixed index) so Trang re-ordering columns in the sheet won't break parsing.
// Each field is matched against several candidate names (exact, then prefix)
// so cosmetic header tweaks ("CR used %" → "CR used") stay parseable.
// Header (current): Tier | Country | Code | Category | Status | # KW | Imp |
//   Clicks | Inst | Spend | CR act % | CPC act | CPI act | Avg Pos | % Top-3 |
//   Bid p75 | CR used % | Max Allowed | Bid Rec ⭐ | Est Pos @ Rec | Ceil Blk |
//   Action
// ---------------------------------------------------------------------------

export function parseBidCap(rows: string[][]): BidCapRow[] {
  if (!rows || rows.length < 2) return [];
  const norm = (c: unknown): string => str(c).trim().toLowerCase();
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = (rows[i] ?? []).map(norm);
    const hasBidRec = r.some((h) => h.startsWith('bid rec') || h === 'bid_recommended');
    if (r.includes('country') && r.includes('category') && (hasBidRec || r.includes('action'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];
  const header = (rows[headerIdx] ?? []).map(norm);
  // Match a column by trying each candidate as an exact header, then as a prefix.
  const find = (...cands: string[]): number => {
    for (const c of cands) {
      const i = header.indexOf(c);
      if (i >= 0) return i;
    }
    for (const c of cands) {
      const i = header.findIndex((h) => h.startsWith(c));
      if (i >= 0) return i;
    }
    return -1;
  };
  const ci = {
    tier: find('tier'),
    country: find('country'),
    countryCode: find('code', 'country_code'),
    category: find('category'),
    status: find('status'),
    nKw: find('# kw', 'n_kw'),
    impL30: find('imp', 'imp_l30'),
    clicksL30: find('clicks', 'clicks_l30'),
    installsL30: find('inst', 'installs_l30'),
    spendL30: find('spend', 'spend_l30'),
    crActual: find('cr act', 'cr_actual'),
    cpcActual: find('cpc act', 'cpc_actual'),
    cpiActual: find('cpi act', 'cpi_actual'),
    avgPosition: find('avg pos', 'avg_position'),
    visibility: find('% top-3', '% top3', 'top-3', 'visibility'),
    bidFloorTop3: find('bid p75', 'bid_floor_top3', 'bid floor'),
    crUsed: find('cr used', 'cr_used'),
    maxBidCeiling: find('max allowed', 'max_bid_ceiling', 'max bid ceiling'),
    bidRecommended: find('bid rec', 'bid_recommended'),
    estPosAtRec: find('est pos', 'est_pos_at_rec'),
    ceilBlocked: find('ceil blk', 'ceil blocked', 'ceiling blocked'),
    actionRecommended: find('action', 'action_recommended'),
  };
  const at = (row: string[], idx: number): unknown => (idx >= 0 ? row[idx] : undefined);
  return rows
    .slice(headerIdx + 1)
    .map((row): BidCapRow | null => {
      const country = str(at(row, ci.country)).trim();
      const category = str(at(row, ci.category)).trim();
      if (!country || !category) return null;
      return {
        tier: str(at(row, ci.tier)).trim(),
        country,
        countryCode: str(at(row, ci.countryCode)).trim(),
        category,
        status: str(at(row, ci.status)).trim(),
        nKw: num(at(row, ci.nKw)),
        impL30: num(at(row, ci.impL30)),
        clicksL30: num(at(row, ci.clicksL30)),
        installsL30: num(at(row, ci.installsL30)),
        spendL30: num(at(row, ci.spendL30)),
        crActual: num(at(row, ci.crActual)),
        cpcActual: num(at(row, ci.cpcActual)),
        cpiActual: num(at(row, ci.cpiActual)),
        avgPosition: numOrNull(at(row, ci.avgPosition)),
        visibility: numOrNull(at(row, ci.visibility)),
        bidFloorTop3: numOrNull(at(row, ci.bidFloorTop3)),
        crUsed: num(at(row, ci.crUsed)),
        maxBidCeiling: num(at(row, ci.maxBidCeiling)),
        bidRecommended: num(at(row, ci.bidRecommended)),
        estPosAtRec: numOrNull(at(row, ci.estPosAtRec)),
        ceilBlocked: /^true$/i.test(str(at(row, ci.ceilBlocked)).trim()),
        actionRecommended: str(at(row, ci.actionRecommended)).trim(),
      };
    })
    .filter((r): r is BidCapRow => r !== null);
}

// ---------------------------------------------------------------------------
// Paused_camp — keyword rows of campaigns that have been PAUSED (same schema as
// Master KW Lookup, header on row 2). parseMasterKw's header detection handles
// it as-is; alias kept for call-site clarity.
// ---------------------------------------------------------------------------

export const parsePausedCamp = parseMasterKw;

// ---------------------------------------------------------------------------
// Camp_Links — Camp Name → Campaign ID / URL / Geo targeting.
// Row 1 = title, row 2 = header (Category | Camp Name | Campaign ID | URL | Geo),
// row 3+ = data. Geo cell is messy (VN/EN names, "-IN, PK" exclusions, blanks).
// ---------------------------------------------------------------------------

export function parseCampLinks(rows: string[][]): CampLinkRow[] {
  if (!rows || rows.length < 3) return [];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (str(rows[i]?.[0]).trim() === 'Category' && str(rows[i]?.[2]).trim() === 'Campaign ID') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];
  return rows
    .slice(headerIdx + 1)
    .map((row): CampLinkRow | null => {
      const camp = str(row?.[1]).trim();
      if (!camp) return null;
      return {
        category: str(row[0]).trim(),
        camp,
        campaignId: str(row[2]).trim(),
        url: str(row[3]).trim(),
        geoRaw: str(row[4]).trim(),
      };
    })
    .filter((r): r is CampLinkRow => r !== null);
}

// ---------------------------------------------------------------------------
// Negative KW list — keywords explicitly added as negatives in paid campaigns.
// Keyword lives in column B (index 1); column A / extra columns are ignored.
// Lenient: read every row's col B, drop empties. A header word slipping through
// is harmless (it won't match a real search term in the exact-match lookup).
// ---------------------------------------------------------------------------

export function parseNegativeKw(rows: string[][]): string[] {
  if (!rows || rows.length === 0) return [];
  return rows
    .map((row) => str(row?.[1]).trim())
    .filter((kw) => kw.length > 0);
}

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
