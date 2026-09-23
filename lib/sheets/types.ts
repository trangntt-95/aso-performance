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
  /** Cột "Campaign ID" — có từ bản Master dựng từ Shopify Ads (23/09/2026); bản dán tay không có. */
  campaignId?: string;
}

/**
 * One recommended bid per Country × Category, fully computed in the 'Max bid cap'
 * sheet tab (Apps Script). The dashboard only reads + filters — no recompute.
 */
/**
 * One country in the revenue block of 'Countries performance' (columns I–P).
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
 * One entry of the hand-kept 'Excluded Countries' column in Countries performance.
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
 * A market tier from the Countries performance tier block, with the countries in it.
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

/** One row of the 'Countries performance' tab — the CPI ceiling set per country. */
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

/**
 * Một dòng của tab 'Net value per install': keyword × nước.
 *
 * Trang xác nhận định nghĩa: net value = doanh thu − phí Shopify. Đã trừ phí
 * nền tảng, CHƯA trừ tiền quảng cáo — nên netPerInstall so trực tiếp được với
 * trần CPI, và trừ spend lần nữa ở phía dashboard là trừ hai lần.
 *
 * Đây là grain mà 'Countries Performance' không có: nó chỉ nói một install ở
 * Mỹ đáng bao nhiêu, còn tab này nói install của 'true profit' ở Mỹ đáng bao
 * nhiêu — và hai keyword trong cùng một nước lệch nhau rất xa ($141 cho
 * 'true profit' so với $82 cho 'trueprofit').
 */
export interface NetValueRow {
  /** 'search' (organic) hoặc 'search_ad' (paid) — như cột Surface của sheet. */
  surface: Surface;
  /** Keyword như sheet ghi. */
  keyword: string;
  /** Bản đã giải mã, khi keyword gốc bị encode. Rỗng thì dùng keyword. */
  keywordDecoded: string;
  cluster: string;
  country: string;
  installs: number;
  /** Số shop đã trả tiền — mẫu số thật của độ tin cậy, không phải installs. */
  payingShops: number;
  /** Doanh thu trừ phí Shopify, tổng cho nhóm install này. */
  netValue: number;
  /** netValue ÷ installs. */
  netPerInstall: number | null;
  /** CR của paid, đơn vị phần trăm. */
  paidCrPct: number | null;
  /**
   * Số đơn 30 ngày của shop lớn nhất trong nhóm.
   *
   * Đây là cột cảnh báo tập trung: một keyword có net value cao vì một shop
   * khổng lồ thì con số đó không lặp lại được, và bid theo nó là bid theo một
   * lần may. Không có cột này thì không phân biệt được với keyword đều đặn.
   */
  largestShopOrders: number | null;
  /** Số shop không có đơn nào trong 30 ngày — phần đã tắt của nhóm. */
  shopsZeroOrders: number | null;
}

/**
 * Một câu tìm kiếm trong 'Search_Term_Unbidded' — query broad match đã bắt
 * được nhưng chưa được bid thành keyword riêng.
 *
 * Grain là CÂU NGƯỜI TA GÕ, không phải keyword đang bid, nên nó không xếp
 * chung bảng với phần còn lại của Paid Coverage: cả tab dùng chung một khoảng
 * ngày, không có cửa sổ L7/L30/L90 nào để điền.
 */
export interface SearchTermRow {
  searchTerm: string;
  /** Keyword đang bid đã bắt được câu này. */
  matchedKeyword: string;
  matchType: string;
  camp: string;
  /** Bid của keyword đã bắt được nó — không phải giá trả cho câu này. */
  bid: number | null;
  impressions: number;
  clicks: number;
  installs: number;
  spend: number;
  position: number | null;
  customers: number;
  revenue: number;
  /** Return on spend từ sheet. */
  roas: number | null;
  /** Cột Bid Status của sheet, ví dụ '⚠️ Chưa bid'. */
  bidStatus: string;
}

export interface BidCapRow {
  tier: string;
  country: string;
  countryCode: string;
  category: string;
  /** Keyword cluster inside the category ("B1. Brand chính xác", "C. hyros", …).
   *  Added 2026-08: the sheet used to hold ONE row per Country × Category and now
   *  holds one per Country × Category × Cluster, so a Country × Category is a
   *  GROUP of rows (up to 14) — never assume a single row per cell. '—' when the
   *  sheet leaves the cluster blank. */
  keywordCluster: string;
  /** Sample keywords of the cluster, comma-separated, as typed in the sheet. */
  exampleKeywords: string;
// ── Cột của bản dựng lại 9/2026 ────────────────────────────────────────────
  //
  // Tab được dựng lại quanh một công thức ghi ngay ở dòng tiêu đề:
  //   Bid = min(NetVal × 90% × CR, Tier Ceiling)
  // nên giờ nó mang đủ từng thành phần của phép tính, không chỉ kết quả.
  /**
   * Net value trên mỗi install của nước này ('Net Val' col).
   *
   * Trang xác nhận định nghĩa: (doanh thu − phí Shopify) ÷ install. Đã trừ phí
   * nền tảng nhưng CHƯA trừ tiền quảng cáo — nên nó so trực tiếp được với trần
   * CPI, và trừ spend lần nữa ở phía dashboard sẽ là trừ hai lần.
   *
   * null khi sheet để trống ô đó — khác 0, vốn có nghĩa "một install ở đây
   * không đáng gì".
   */
  netValue: number | null;
  /** Net value của kỳ trước ('Val T4-7' col) — để thấy nó đang lên hay xuống. */
  netValuePrev: number | null;
  /** Net value của kỳ này ('Val T5-8' col). */
  netValueCurr: number | null;
  /** Trần đã hạ 10% cho an toàn ('Cap×90%' col) — mốc mà bid thật phải nằm dưới. */
  capAt90: number | null;
  /** CR dùng trong công thức ('CR used %' col), đơn vị phần trăm. */
  crUsedPct: number | null;
  /** CR đó lấy từ đâu ('CR source' col): 'L90 actual 70% ×0.95', 'Cat avg 18% ×2.11'… */
  crSource: string;
  /** Cảnh báo của chính sheet ('⚠️ Warning' col), ví dụ 'BID $51.68 > $45'. */
  warning: string;

  // ── Cột của bản cũ, đã biến mất khỏi sheet 9/2026 ─────────────────────────
  //
  // Giữ lại field để phần đọc cũ không vỡ, nhưng chúng về 0 trên mọi dòng của
  // bản dựng lại. Đo live 10/9/2026: cpiCap, instL90, clicksL30, installsL30,
  // crActual, countryCode, actionRecommended đều rỗng toàn bộ 274 dòng. Màn
  // nào đang dựa vào chúng thì đang hiển thị số 0, không phải số thật.
  /** Installs over the last 90 days ('Inst L90' col). Đã bỏ khỏi sheet. */
  instL90: number;
  /** Clicks per month ('Clicks/mo' col). Đã bỏ khỏi sheet. */
  clicksL30: number;
  /** Installs per month ('Inst/mo' col). Đã bỏ khỏi sheet. */
  installsL30: number;
  /** CR ('CR %' col), in percent. Đã bỏ khỏi sheet — dùng crUsedPct. */
  crActual: number;
  /** Allowed CPI ceiling for this cell ('CPI cap' col). 0 = the sheet left it
   *  blank, which it does on every row it tells you to cut. NOT a measured CPI —
   *  the sheet no longer carries actual spend, so no CPI can be measured. */
  cpiCap: number;
  /** Tier-level bid ceiling this cell is capped by ('Tier ceil.' col). */
  tierCeiling: number;
  /** The headline number: bid to set ('Bid Rec ⭐' col). 0 = blank, which the
   *  sheet leaves on 'Cắt / Pause' rows (825 of 1501 as of 2026-08). Guard with
   *  `> 0` rather than treating 0 as a real recommendation of zero. */
  bidRecommended: number;
  /** 'Action' col — Giữ / Hạ mạnh / Cắt / Cắt / Pause / —. */
  actionRecommended: string;
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
  /** 'Average Position' của Shopify Ads hôm đó (1 = trên cùng). null khi
   *  export không có cột này hoặc ô trống — khác 0, vì 0 không phải vị trí. */
  position: number | null;
  /** 'Visibility' — tỷ lệ phiên tìm kiếm mà camp có hiển thị, 0–1. */
  visibility: number | null;
}

export interface CampLinkRow {
  category: string;
  camp: string;
  campaignId: string;
  url: string;
  /** Raw Geo cell — mixed VN/EN country names, "-IN, PK" exclusions, "All countries/regions". */
  geoRaw: string;
  /** Tên cũ của cùng campaign (cột "Tên cũ (alias)", 23/09/2026): Trang đổi đuôi
   *  tên trên Shopify, export/Master/note cũ còn mang tên cũ → vẫn quy về dòng này. */
  aliases?: string[];
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
  /** CPI ceiling + revenue rank per country ('Countries performance' tab). This is the
   *  config the bid recommendations are derived FROM, so it's carried
   *  separately to let the UI show intent next to outcome. */
  perGeoCpiCap: PerGeoCpiCapRow[];
  /** Revenue per country ('Countries performance' columns I–P), refreshed quarterly.
   *  The definition of the core market and the only source of what an install
   *  is actually worth. */
  perGeoRevenue: PerGeoRevenueRow[];
  /** Period the revenue block covers, e.g. "tháng 4-7". */
  perGeoRevenuePeriod: string;
  /** Tier → countries → max bid, from the tier block of Countries performance. This is
   *  what lets a camp named "… Tier 2" be resolved to actual countries. */
  marketTiers: MarketTierRow[];
  /** Countries Trang has decided not to buy, or to buy only at a low bid
   *  ('Excluded Countries' column of Countries performance). Replaces the list that
   *  used to be hardcoded in the Google Ads report. */
  excludedCountries: ExcludedCountryRow[];
  /** Per-campaign aggregate paid spend ('Shopify_daily' tab) — for overbid detection. */
  shopifyCamps: ShopifyCampRow[];
  /** Date range the Shopify_daily totals cover (from cell A2), e.g. "01/03/2026 → 14/06/2026". */
  shopifyDateRange: string;
  /** The hand-built 'By categories' pivot from the Shopify Ads spreadsheet, read
   *  as-is. Null when that tab is missing or unreadable — every other screen
   *  works without it. */
  paidCategoryBoard: PaidCategoryBoard | null;
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
  /** The spreadsheets behind this payload, so a screen can link its own source
   *  instead of describing it in prose. Only the configured ones appear. A
   *  spreadsheet id is a document the owner already has open, not a credential. */
  /** Tab 'Search_Term_Unbidded' — query broad match chưa được bid. */
  searchTermUnbidded: SearchTermRow[];
  /** Khoảng ngày báo cáo đó phủ. */
  searchTermRange: { from: string; to: string };
  /** Tab 'Net value per install' — net value theo keyword × nước. */
  netValuePerInstall: NetValueRow[];
  /** Ghi chú phạm vi của tab đó, ví dụ 'Keyword x country — YTD'. */
  netValueScope: string;
  sheetSources: { id: 'aso' | 'shopify' | 'gads'; label: string; url: string }[];
  /**
   * Tab đã khai trong TABS nhưng không có trong spreadsheet.
   *
   * Có mặt vì lần đổi tên PerGeo_CPI_Cap làm mất sạch trần CPI và trọng số
   * doanh thu mà không có một lỗi nào — 0 dòng trông y hệt "chưa có data".
   */
  missingTabs: string[];
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

/**
 * One category's row in the 'By categories' pivot of the Shopify Ads sheet —
 * a dashboard maintained by hand there, read rather than recomputed.
 */
export interface PaidCategorySnapshot {
  category: string;
  installs: number;
  spend: number;
  /** As the sheet computes it. Null where it left the cell blank — which it does
   *  for a category with zero installs, rather than writing a division by zero. */
  cpi: number | null;
  clicks: number;
  impressions: number;
  /** Fractions, not percentages — the sheet stores 0.32, not 32. */
  cr: number | null;
  cpc: number | null;
  ctr: number | null;
  position: number | null;
}

/** One metric's eight-period series, per category, from the right-hand block. */
export interface PaidCategorySeries {
  /** The metric label as the sheet writes it: INSTALLS, Impressions, Click, CR,
   *  CPI, CPC, Pos, CTR, Spend. */
  metric: string;
  rows: {
    category: string;
    /** t1 … t8, oldest first. Null where the sheet has no value for a period. */
    values: (number | null)[];
    /** The sheet's own '% growth' cell — carried rather than derived, so the
     *  screen cannot disagree with the sheet about its own figure. */
    growth: number | null;
  }[];
  /** Column totals under the per-category rows, when the sheet has them. */
  totals: (number | null)[];
  totalsGrowth: number | null;
}

export interface PaidCategoryBoard {
  /** The tab this was read from, and a link to the spreadsheet holding it.
   *  Carried so the screen can name its own source instead of describing it in
   *  prose that drifts when the sheet is renamed. The URL is built from the
   *  configured id — a document id the owner already has, not a credential.
   *  Empty when the id isn't configured. */
  sourceTab: string;
  sourceUrl: string;
  /** The window the snapshot block covers, ISO. Empty when A1 is unreadable. */
  from: string;
  to: string;
  /** Period labels exactly as the sheet writes them (t1…tN — 8 in August 2026,
   *  9 from September; the count is read from the header, never assumed). */
  periods: string[];
  /** The same periods as calendar months ('T8/26'), derived — not read. The sheet
   *  dates only its last period, in A1; Trang confirmed (2026-09-08) the columns
   *  are consecutive months, so the rest are counted back from that one. Empty
   *  when A1 is unreadable or is not a whole calendar month, in which case the
   *  premise doesn't hold and `periods` is all there is to show. */
  periodMonths: string[];
  /** Set when A1 is the CURRENT month, started but not finished: the last
   *  period is that month, and this says how many days of it the sheet has.
   *  null for a whole month or when A1 is unreadable. */
  lastPeriodPartial: { from: string; to: string; days: number } | null;
  snapshot: PaidCategorySnapshot[];
  /** Snapshot totals row ('TOTAL'), as the sheet computes it. */
  snapshotTotal: PaidCategorySnapshot | null;
  series: PaidCategorySeries[];
}
