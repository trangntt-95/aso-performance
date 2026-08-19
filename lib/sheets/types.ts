// ============================================================================
// Core enums
// ============================================================================

import type { GoogleAdsPayload } from './googleAdsTypes';

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
  // TOTAL whole-account columns added to Market_Index schema 2026-06 (cols
  // 10–15). They sit BEFORE verdict/cause — before this the parser read
  // verdict/primaryCause/causeDetails one block too far left (showed numbers).
  totalUsersL: number;
  totalUsersP: number;
  deltaTotalUsersPct: number;
  totalGetAppL: number;
  totalGetAppP: number;
  deltaTotalGetAppPct: number;
  verdict: Verdict;
  /** Basket-vs-total divergence note, e.g. "⚠️ Tail growing…" / "✅ Consistent". */
  divergence: string;
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

/**
 * One day of TRUE per-day metrics for a keyword in ONE Tier-1 country
 * ('History_Daily_Country' tab). Deliberately a separate tab from History_Daily:
 * adding a country column there would break its (date|term|surface) key, and
 * GA4 withholds low-volume rows on granular queries — so country detail is kept
 * only for the ~10 markets whose samples survive that thresholding.
 *
 * Every metric is TRUE per-day (GA4 queried with a one-day range), so these CAN
 * be summed across a date range. There is no rolling L7D block here on purpose.
 */
export interface HistoryDailyCountryRow {
  snapshotDate: string | number;
  country: string;
  searchTerm: string;
  surface: Surface;
  usersDaily: number;
  getAppDaily: number | null;
  crDaily: number | null;
  posDaily: number | null;
  source: string;
}

export interface KwAddedManualRow {
  keyword: string;
  camp: string;
  note: string;
}

// Only the four fields the dashboard actually reads. The Master tab also carries
// matchType / impressions / clicks / installs / classification, but nothing
// consumes them and this row type is the payload's 2nd-biggest tab
// (masterKwLookup ~13k rows + pausedKw ~4.7k) — so they stay out of the JSON.
export interface MasterKwRow {
  category: string;
  camp: string;
  keyword: string;
  bidMax: string;
}

/**
 * One recommended bid per Country × Category, fully computed in the 'Max bid cap'
 * sheet tab (Apps Script). The dashboard only reads + filters — no recompute.
 */
/**
 * One country in the revenue block of 'PerGeo_CPI_Cap' (columns I–P).
 *
 * This is the block Trang refreshes each quarter, and it is the authority on
 * what the core market is: actual revenue, not a hand-kept rank. `valuePerInstall`
 * is the number that makes a CPI cap judgeable — a ceiling above it buys installs
 * that cannot pay for themselves.
 */
export interface PerGeoRevenueRow {
  /** Rank by revenue, from column I. */
  rank: number;
  country: string;
  installs: number;
  /** Users who made a first payment. */
  firstPaid: number;
  /** firstPaid / installs. */
  firstPaidCr: number | null;
  /** Average revenue per paying user. */
  arppu: number | null;
  revenue: number;
  /** Revenue ÷ installs — what one install is worth in this country. */
  valuePerInstall: number | null;
}

/**
 * One entry of the hand-kept 'Excluded Countries' column in PerGeo_CPI_Cap.
 *
 * The column mixes two decisions in one list: a bare country name is a hard
 * exclude, while a name carrying a parenthetical note ("Brazil (bid thấp)",
 * "Pakistan (cân nhắc bid)") is a country still bought, but deliberately
 * restrained. Collapsing both into one boolean would lose the difference that
 * makes them different actions.
 */
export interface ExcludedCountryRow {
  country: string;
  /** The parenthetical, verbatim. Empty for a hard exclude. */
  note: string;
  /** False when a note qualifies it — bid low rather than stop. */
  hardExclude: boolean;
}

/**
 * A market tier from the PerGeo_CPI_Cap tier block, with the countries in it.
 *
 * Each tier column states a max-bid figure ("100", "$30-40", "$8-15") and lists
 * its countries below. A country may carry its own override in parentheses —
 * "Hong Kong (60$)", "Japan (109$)" — which beats the tier figure, and may carry
 * a plain note instead ("Austria (vol hơi nhỏ)") which is commentary, not a bid.
 */
export interface MarketTierRow {
  /** 'Tier 1 - Premium', 'Tier 1,5', 'Tier 2', … */
  tier: string;
  /** The bid text as written, e.g. '$30-40'. Kept verbatim for display. */
  bidText: string;
  /** Upper bound parsed from bidText; null when it isn't a number. */
  maxBid: number | null;
  countries: {
    country: string;
    /** Per-country override parsed from '(60$)'. null when absent. */
    bidOverride: number | null;
    /** Parenthetical that wasn't a number — kept as commentary. */
    note: string;
  }[];
}

/** One row of the 'PerGeo_CPI_Cap' tab — the CPI ceiling set per country. */
export interface PerGeoCpiCapRow {
  country: string;
  /** Revenue rank of the country (1 = biggest). null when the cell is blank. */
  rank: number | null;
  /** Max CPI we're willing to pay in this country, in USD. */
  cap: number;
  /** 'Tier 1 Market?' column — the countries worth defending. */
  tier1: boolean;
  note: string;
}

export interface BidCapRow {
  tier: string;
  country: string;
  countryCode: string;
  category: string;
  /** Coverage status: PROVEN / EARLY SIGNAL / NO CAMP / IMP ONLY / … */
  status: string;
  nKw: number;
  impL30: number;
  clicksL30: number;
  installsL30: number;
  spendL30: number;
  crActual: number;
  cpcActual: number;
  cpiActual: number;
  avgPosition: number | null;
  /** % of impressions in top-3 ('% Top-3' col). */
  visibility: number | null;
  /** p75 of bids ('Bid p75' col). */
  bidFloorTop3: number | null;
  crUsed: number;
  /** Ceiling = max bid allowed ('Max Allowed' col). */
  maxBidCeiling: number;
  /** The headline number: bid to set ('Bid Rec ⭐' col). */
  bidRecommended: number;
  /** Estimated avg position at the recommended bid ('Est Pos @ Rec' col). */
  estPosAtRec: number | null;
  /** True if the recommendation was capped by the ceiling ('Ceil Blk' col). */
  ceilBlocked: boolean;
  actionRecommended: string;
  /** Campaign link the user maintains by hand in the 'Max bid cap' sheet
   *  ('Link campaign' col). Raw cell text — a campaign NAME (values.get can't
   *  read a hyperlink's URL, only its display text) or a pasted URL. Shown as-is
   *  on the dashboard, taking priority over the auto-detected camp link. */
  linkCampaign: string;
}

/**
 * One campaign's aggregate paid spend from the 'Shopify_daily' tab. Columns:
 * Camp name | Impressions | Clicks | Installs | Spend — totals over the date
 * range named in the header row (e.g. 2026-03-01 → 2026-06-14). No bid column;
 * effective CPC = Spend/Clicks is the proxy for the bid being paid.
 */
export interface ShopifyCampRow {
  camp: string;
  impressions: number;
  clicks: number;
  installs: number;
  spend: number;
}

/**
 * One campaign's spend for ONE day, from the separate Shopify Ads export sheet
 * ('By campaign' tab). This is what makes a bid change measurable: the main
 * sheet's Shopify_daily is a single aggregate row per camp for the whole period,
 * so it has no before/after.
 */
export interface ShopifyDailyRow {
  /** ISO yyyy-mm-dd. */
  date: string;
  camp: string;
  impressions: number;
  clicks: number;
  installs: number;
  spend: number;
}

export interface CampLinkRow {
  category: string;
  camp: string;
  campaignId: string;
  url: string;
  /** Raw Geo cell — mixed VN/EN country names, "-IN, PK" exclusions, "All countries/regions". */
  geoRaw: string;
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
  // top_contrib_windows / email_sent exist in the AlertLog tab but nothing reads
  // them — left out of the payload.
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
  /** Per-day metrics split by country, Tier-1 markets only. Empty until the
   *  Apps Script job has run — every reader must tolerate that. */
  historyDailyCountry: HistoryDailyCountryRow[];
  alertLog: AlertLogRow[];
  kwAddedManual: KwAddedManualRow[];
  masterKwLookup: MasterKwRow[];
  /** Keyword rows of PAUSED campaigns ('Paused_camp' tab, same schema as Master).
   *  Camps listed here are no longer bidding — excluded from "In Paid". */
  pausedKw: MasterKwRow[];
  /** Camp → Campaign ID / URL / Geo targeting ('Camp_Links' tab). */
  campLinks: CampLinkRow[];
  /** Recommended bid per Country × Category ('Max bid cap' tab). */
  bidCap: BidCapRow[];
  /** CPI ceiling + revenue rank per country ('PerGeo_CPI_Cap' tab). This is the
   *  config the bid recommendations are derived FROM, so it's carried
   *  separately to let the UI show intent next to outcome. */
  perGeoCpiCap: PerGeoCpiCapRow[];
  /** Revenue per country ('PerGeo_CPI_Cap' columns I–P), refreshed quarterly.
   *  The definition of the core market and the only source of what an install
   *  is actually worth. */
  perGeoRevenue: PerGeoRevenueRow[];
  /** Period the revenue block covers, e.g. "tháng 4-7". */
  perGeoRevenuePeriod: string;
  /** Tier → countries → max bid, from the tier block of PerGeo_CPI_Cap. This is
   *  what lets a camp named "… Tier 2" be resolved to actual countries. */
  marketTiers: MarketTierRow[];
  /** Countries Trang has decided not to buy, or to buy only at a low bid
   *  ('Excluded Countries' column of PerGeo_CPI_Cap). Replaces the list that
   *  used to be hardcoded in the Google Ads report. */
  excludedCountries: ExcludedCountryRow[];
  /** Per-campaign aggregate paid spend ('Shopify_daily' tab) — for overbid detection. */
  shopifyCamps: ShopifyCampRow[];
  /** Date range the Shopify_daily totals cover (from cell A2), e.g. "01/03/2026 → 14/06/2026". */
  shopifyDateRange: string;
  /** Per-DAY campaign spend from the separate Shopify Ads sheet, trimmed to a
   *  recent window. Empty when that sheet isn't configured or readable. */
  shopifyDaily: ShopifyDailyRow[];
  /** Google Ads export — a different channel in a different currency, so it
   *  gets its own page rather than joining the ASO tables. Empty when that
   *  sheet isn't configured. */
  googleAds: GoogleAdsPayload;
  /** Keywords explicitly set as negatives (from 'Negative KW list' tab, col B). */
  negativeKw: string[];
  /** Actual date range each window (L3/L7/...) covers, parsed from tab titles. */
  windowDates: Record<string, { from: string; to: string }>;
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
