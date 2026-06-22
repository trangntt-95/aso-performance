export const TABS = [
  'Action_Queue',
  'Market_Index',
  'Tier1_Market_Watch',
  'Keyword_Opportunity_Lab',
  'Max bid cap',
  'All_L3',
  'All_L7',
  'All_L14',
  'All_L30',
  'All_L90',
  'All_L365',
  'Country_L3',
  'Country_L7',
  'Country_L14',
  'Country_L30',
  'Country_L90',
  'Country_L365',
  'History',
  'History_Daily',
  'AlertLog',
  'KW_Added_Manual',
  'Master KW Lookup',
  'Negative KW list',
  'Paused_camp',
  'Camp_Links',
  'Shopify_daily',
] as const;

export type TabName = (typeof TABS)[number];

export const WINDOW_TABS_ALL = ['All_L3', 'All_L7', 'All_L14', 'All_L30', 'All_L90'] as const;
export const WINDOW_TABS_COUNTRY = ['Country_L3', 'Country_L7', 'Country_L14', 'Country_L30', 'Country_L90'] as const;
