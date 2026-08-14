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
  meta: GoogleAdsMeta | null;
}

export const EMPTY_GOOGLE_ADS: GoogleAdsPayload = {
  campaigns: [],
  share: [],
  searchTerms: [],
  convActions: [],
  landing: [],
  meta: null,
};
