// ============================================================================
// Core enums
// ============================================================================

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export type Window = 'L3' | 'L7' | 'L14' | 'L30' | 'L90' | 'L365' | 'L90+L30';

export type Surface = 'search' | 'search_ad';

export type SurfaceLabel = 'organic' | 'paid';

export type Category =
  | 'Brand'
  | 'Competitor'
  | 'Profit'
  | 'Feature'
  | 'CatePage'
  | 'Category'
  | 'Language'
  | 'Others'
  | 'Test'
  | 'CPM'
  | 'Noise'
  | 'Unknown';

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

export type BidAction =
  | 'RAISE BID'
  | 'REDUCE BID'
  | 'AUDIT KW'
  | 'AUDIT MATCH TYPE'
  | 'NEGATIVE'
  | 'PAUSE'
  | 'SCALE'
  | 'MONITOR'
  | 'HOLD'
  | 'EXPAND TO PAID'
  | 'RAISE BID PAID'
  | 'HOLD PAID'
  | 'REVIEW PAID BID'
  | 'CHECK ORGANIC'
  | 'CHECK ORGANIC ALGO'
  | 'CHECK LISTING'
  | 'REVIEW LISTING'
  | 'MONITOR ORGANIC'
  | 'REVIEW';

export type Verdict =
  | '📉 MARKET DOWN'
  | '⚠️ SOFT DECLINE'
  | '→ STABLE'
  | '📈 SOFT GROWTH'
  | '🚀 MARKET UP';

// ============================================================================
// Row models per tab
// ============================================================================

export interface ActionQueueRow {
  priority: Priority;
  score: number;
  category: Category;
  keyword: string;
  surface: SurfaceLabel;
  country: string;
  window: Window;
  alert: AlertType;
  bidAction: BidAction;
  bidSuggest: string;
  targetCamp: string;
  note: string;
  keyStats: string;
}

export interface MarketIndexSummaryRow {
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
  verdict: Verdict;
  primaryCause: string;
  causeDetails: string;
}

export interface ChannelMetrics {
  users: number;
  getapp: number;
  cr: number;
  pos: number | null;
}

export interface FunnelBreakdown {
  window: Window;
  organic: { L: ChannelMetrics; P: ChannelMetrics };
  paid: { L: ChannelMetrics; P: ChannelMetrics };
  total: { L: { users: number; getapp: number }; P: { users: number; getapp: number } };
}

export interface ExecutiveSummary {
  overallHealth?: { value: string; visual: string; status: string };
  trendSparkline?: string;
  topConcern?: { value: string; status: string };
  topOpportunity?: { value: string; status: string };
  installPerDayL7?: number;
  installTargetText?: string;
  installVsTarget?: number;
  installPacingVisual?: string;
  installPacingStatus?: string;
  quarterTargetText?: string;
  cpiTargetText?: string;
}

export interface WowMetric {
  metric: string;
  thisPeriod: number;
  lastPeriod: number;
  deltaValue: number;
  deltaPct: number;
  status: string;
}

export interface DynamicBasketItem {
  rank: number;
  searchTerm: string;
  l90Users: number;
}

export interface MarketIndexData {
  summary: MarketIndexSummaryRow[];
  funnels: FunnelBreakdown[];
  narratives: Partial<Record<Window, string>>;
  executiveSummary?: ExecutiveSummary;
  wow: WowMetric[];
  basket: DynamicBasketItem[];
}

export interface KeywordRow {
  category: Category;
  searchTerm: string;
  country?: string;
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

export interface HistoryRow {
  snapshotDate: string | number;
  searchTerm: string;
  surface: Surface;
  usersL7D: number;
  posL7D: number | null;
  alert: AlertType;
}

export interface HistoryDailyRow {
  snapshotDate: string | number;
  searchTerm: string;
  surface: Surface;
  // L7D rolling (written by daily-snapshot.gs runDailySnapshot)
  usersL7D: number;
  getAppL7D: number | null;
  crL7D: number | null;
  posL7D: number | null;
  // Daily per-day (backfilled by Trang's l30_backfill or future daily-snapshot extension)
  usersDaily: number | null;
  getAppDaily: number | null;
  crDaily: number | null;
  posDaily: number | null;
  source: string;
}

export interface AlertLogRow {
  snapshotDate: string | number;
  keyword: string;
  country: string;
  window: string;
  surface: string;
  posP: number | null;
  posL: number | null;
  deltaPos: number | null;
  usersL: number;
  topContribWindows: string;
  emailSent: boolean;
}

export interface Tier1WatchRow {
  category: Category;
  searchTerm: string;
  country: string;
  surface: Surface;
  window: Window;
  usersL: number;
  usersP: number;
  deltaUsersPct: number;
  posL: number | null;
  posP: number | null;
  alert: AlertType;
}

// ============================================================================
// Aggregated payload returned by /api/sheets
// ============================================================================

export interface SheetPayload {
  actionQueue: ActionQueueRow[];
  marketIndex: MarketIndexData;
  tier1Watch: Tier1WatchRow[];
  allL3: KeywordRow[];
  allL7: KeywordRow[];
  allL14: KeywordRow[];
  allL30: KeywordRow[];
  allL90: KeywordRow[];
  countryL3: KeywordRow[];
  countryL7: KeywordRow[];
  countryL14: KeywordRow[];
  countryL30: KeywordRow[];
  countryL90: KeywordRow[];
  allL365: SnapshotRow[];
  countryL365: SnapshotRow[];
  history: HistoryRow[];
  historyDaily: HistoryDailyRow[];
  alertLog: AlertLogRow[];
  fetchedAt: string;
}

// ============================================================================
// Local state (Zustand persist)
// ============================================================================

export type RowStatus = 'new' | 'in_progress' | 'done' | 'skipped' | 'snoozed';

export interface RowStatusRecord {
  status: RowStatus;
  updatedAt: string;
  note?: string;
}
