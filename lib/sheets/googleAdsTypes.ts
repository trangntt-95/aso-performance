// Google Ads export ("Google ads - Appscript"), a second spreadsheet written by
// its own Apps Script. Every tab is already per-day, so unlike the Shopify
// export nothing here needs reconstructing.
//
// This is a DIFFERENT channel from the rest of the dashboard: its campaigns and
// keywords have no counterpart in Camp_Links or Master KW Lookup, and its money
// is in VND while Shopify Ads is in USD. It therefore lives on its own page
// rather than being folded into the ASO tables.

export interface GoogleAdsCampaignDay {
  date: string;
  campaignId: string;
  campaignName: string;
  status: string;
  channel: string;
  /** Daily budget, in the account currency (micros are already resolved). */
  budget: number;
  impressions: number;
  clicks: number;
  cost: number;
  /** Google's own conversion count — a MIX of page views, add-to-carts and
   *  installs. Never read as installs; see GoogleAdsConvActionDay. */
  conversions: number;
  convValue: number;
}

export interface GoogleAdsShareDay {
  date: string;
  campaignName: string;
  /** Impression share, 0–1. */
  is: number | null;
  /** Share lost because the budget ran out, 0–1. */
  isLostBudget: number | null;
  /** Share lost because the ad rank was too low, 0–1. */
  isLostRank: number | null;
  /** Absolute top-of-page impression share, 0–1. */
  absTopIs: number | null;
  /** Top-of-page impression share, 0–1. */
  topIs: number | null;
  /** Share of clicks won, 0–1. Null on campaigns Google won't report it for. */
  clickShare: number | null;
  /** Exact-match impression share, 0–1. */
  exactMatchIs: number | null;
  impressions: number;
  clicks: number;
  cost: number;
}

/** One keyword-day with its Quality Score components. */
export interface GoogleAdsKeywordDay {
  date: string;
  campaignName: string;
  adgroupName: string;
  keyword: string;
  matchType: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  /** 1–10. Null when Google withheld it (too little traffic). */
  qs: number | null;
  /** Ad relevance: BELOW_AVERAGE / AVERAGE / ABOVE_AVERAGE. */
  qsAd: string;
  /** Landing page experience. */
  qsLp: string;
  /** Expected CTR. */
  qsCtr: string;
  impShare: number | null;
  lostRank: number | null;
  absTopIs: number | null;
}

/** Spend per country — the one Google tab that joins to PerGeo_CPI_Cap. */
export interface GoogleAdsCountryDay {
  date: string;
  campaignName: string;
  /** Google geo-target id; resolved to a name through dim_country. */
  countryId: string;
  countryName: string;
  countryCode: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  convValue: number;
}

/** What each campaign is being told to optimise for. */
export interface GoogleAdsBiddingDay {
  date: string;
  campaignName: string;
  bidStrategy: string;
  portfolio: string;
  /** Target CPA in account currency. 0 when the strategy doesn't use one. */
  targetCpa: number;
  targetRoas: number;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
}

export interface GoogleAdsDeviceDay {
  date: string;
  campaignName: string;
  device: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
}

/** One RSA asset (headline / description) and how Google rates it. */
export interface GoogleAdsAssetDay {
  date: string;
  campaignName: string;
  adgroupName: string;
  /** HEADLINE / DESCRIPTION / … */
  fieldType: string;
  /** BEST / GOOD / LOW / LEARNING / PENDING / NOT_APPLICABLE. */
  perfLabel: string;
  assetId: string;
  assetText: string;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface GoogleAdsSearchTermDay {
  date: string;
  campaignName: string;
  adgroupName: string;
  searchTerm: string;
  /** ADDED = already a keyword, NONE = matched but never added, EXCLUDED. */
  termStatus: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
}

export interface GoogleAdsConvActionDay {
  date: string;
  campaignName: string;
  actionName: string;
  actionCat: string;
  conversions: number;
  convValue: number;
}

/** Where a campaign's clicks actually landed, bucketed by destination. */
export type AdDestination = 'appstore' | 'website' | 'other';

export interface GoogleAdsLandingDay {
  date: string;
  campaignName: string;
  destination: AdDestination;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
}

export interface GoogleAdsMeta {
  runAt: string;
  account: string;
  /** Account currency — VND for this account, so figures are NOT comparable to
   *  the USD used everywhere else without an explicit rate. */
  currency: string;
  window: string;
}

export interface GoogleAdsPayload {
  campaigns: GoogleAdsCampaignDay[];
  share: GoogleAdsShareDay[];
  searchTerms: GoogleAdsSearchTermDay[];
  convActions: GoogleAdsConvActionDay[];
  landing: GoogleAdsLandingDay[];
  keywords: GoogleAdsKeywordDay[];
  countries: GoogleAdsCountryDay[];
  bidding: GoogleAdsBiddingDay[];
  devices: GoogleAdsDeviceDay[];
  assets: GoogleAdsAssetDay[];
  meta: GoogleAdsMeta | null;
}

export const EMPTY_GOOGLE_ADS: GoogleAdsPayload = {
  campaigns: [],
  share: [],
  searchTerms: [],
  convActions: [],
  landing: [],
  keywords: [],
  countries: [],
  bidding: [],
  devices: [],
  assets: [],
  meta: null,
};
