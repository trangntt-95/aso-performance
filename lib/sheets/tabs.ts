export const TABS = [
  'Action_Queue',
  'Market_Index',
  'Tier1_Market_Watch',
  'Keyword_Opportunity_Lab',
  'Max bid cap',
  // Trang đổi tên 9/2026 (trước là 'PerGeo_CPI_Cap'). Tên cũ vẫn nằm trong
  // LEGACY_TAB_NAMES để bản sao sheet chưa đổi vẫn đọc được.
  'Countries performance',
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
  'History_Daily_Country',
  'AlertLog',
  'KW_Added_Manual',
  'Master KW Lookup',
  'Negative KW list',
  'Paused_camp',
  'Camp_Links',
  'Shopify_daily',
  // Thêm 9/2026: net value trên mỗi install ở grain keyword × nước — con số
  // duy nhất trên toàn workbook trả lời "một install của keyword này đáng bao
  // nhiêu tiền", thay vì chỉ đáng bao nhiêu ở nước nào.
  'Net value per install',
  // Báo cáo search term của Apple Search Ads, đã lọc 'Bid Status = Chưa bid'.
  'Search_Term_Unbidded',
] as const;

export type TabName = (typeof TABS)[number];

/**
 * Tên cũ của một tab, thử tới khi tên hiện tại không có dòng nào.
 *
 * Không phải phòng xa: tab này vừa đổi tên và dashboard im lặng mất sạch trần
 * CPI cùng trọng số doanh thu — 0 dòng, không lỗi, không cảnh báo. Đọc thêm
 * tên cũ khiến một lần đổi tên nữa chỉ là chậm một nhịp, không phải một trang
 * trắng mà không ai biết vì sao.
 */
export const LEGACY_TAB_NAMES: Partial<Record<TabName, string[]>> = {
  'Countries performance': ['PerGeo_CPI_Cap'],
};

export const WINDOW_TABS_ALL = ['All_L3', 'All_L7', 'All_L14', 'All_L30', 'All_L90'] as const;
export const WINDOW_TABS_COUNTRY = ['Country_L3', 'Country_L7', 'Country_L14', 'Country_L30', 'Country_L90'] as const;
