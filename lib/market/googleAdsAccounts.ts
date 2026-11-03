// Hai tài khoản Google Ads chạy chung một màn hình (components/google-ads):
// TrueProfit đọc từ payload /api/sheets, Proveny đọc /api/google-ads-proveny.
// Cả hai dùng cùng Ads Script export → cùng schema tab (campaign_daily, …).

export type GadsAccountKey = 'trueprofit' | 'proveny';

export interface GadsAccountConfig {
  key: GadsAccountKey;
  /** Tên app hiện trên header. */
  app: string;
  /** Host website của app, để gắn nhãn đích "website" cho landing page. */
  websiteHosts: readonly string[];
  /** Biến môi trường chứa id sheet export (hiện trong thông báo "chưa có dữ liệu"). */
  envVar: string;
  path: string;
  /** Có so chéo với ASO/Shopify Ads của TrueProfit không (Brand demand, ghi chú listing). */
  crossChannel: boolean;
}

export const GADS_ACCOUNTS: Record<GadsAccountKey, GadsAccountConfig> = {
  trueprofit: {
    key: 'trueprofit',
    app: 'TrueProfit',
    websiteHosts: ['trueprofit.io'],
    envVar: 'GOOGLE_SHEET_ID_GADS',
    path: '/google-ads',
    crossChannel: true,
  },
  proveny: {
    key: 'proveny',
    app: 'Proveny',
    websiteHosts: ['proveny.io', 'proveny.com', 'proveny.app'],
    envVar: 'GOOGLE_SHEET_ID_GADS_PROVENY',
    path: '/google-ads-proveny',
    crossChannel: false,
  },
};
