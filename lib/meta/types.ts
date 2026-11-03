// Meta Ads của app PROVENY — một account quảng cáo riêng (FireGroup Technology
// JSC), không dính gì tới TrueProfit ASO. Payload này chỉ nuôi tab /meta-proveny.
//
// Mọi số theo `dateRange` (mặc định 30 ngày gần nhất) trừ `daily` (theo ngày, kéo thêm kỳ trước). Tiền USD.

export interface MetaDailyRow {
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  lpv: number; // landing page views
  plays: number;
  thruplays: number;
  p25: number;
  p100: number;
  engagement: number;
  purchases: number;
  purchaseValue: number;
  /** Pixel custom event FirstVideoCreated (KPI chính của camp đang chạy). */
  firstVideoCreated: number;
  /** Pixel event start_trial. */
  startTrials: number;
  /** Pixel event subscribe. */
  subscribes: number;
  /** Pixel complete_registration (đăng ký tài khoản). Snapshot cũ không có. */
  registrations?: number;
}

export interface MetaCampaignRow {
  id: string;
  name: string;
  status: string; // ACTIVE | PAUSED | ...
  dailyBudget: number;
  createdAt: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  linkClicks: number;
  lpv: number;
  /** Tên event mà campaign tối ưu (FirstVideoCreated / Create Video / Visit App). */
  resultType: string;
  results: number;
  plays: number;
  thruplays: number;
  p25: number;
  p100: number;
  engagement: number;
  purchases: number;
  startTrials: number;
  subscribes: number;
  firstVideoCreated: number;
  registrations?: number;
}

export interface MetaAdRow {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  adsetName: string;
  status: string;
  createdAt: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  linkClicks: number;
  lpv: number;
  resultType: string;
  results: number;
  plays: number;
  thruplays: number;
  p25: number;
  p50: number;
  p75: number;
  p100: number;
  avgWatchSec: number;
  engagement: number;
  saves: number;
  comments: number;
  purchases: number;
}

export interface MetaCountryRow {
  country: string; // ISO-2
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  lpv: number;
  plays: number;
  thruplays: number;
  p25: number;
  p100: number;
  engagement: number;
}

export interface MetaPlacementRow {
  platform: string;
  position: string;
  device: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  lpv: number;
  plays: number;
  thruplays: number;
  p25: number;
  p100: number;
}

export interface MetaDemoRow {
  age: string;
  gender: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  lpv: number;
  thruplays: number;
  p25: number;
  p100: number;
}

export interface MetaProvenyPayload {
  account: { id: string; name: string; currency: string; business: string };
  /** `graph_api` = kéo trực tiếp từ Meta bằng token; `snapshot` = file tĩnh trong repo. */
  source: 'graph_api' | 'snapshot';
  fetchedAt: string;
  /** Khoảng ngày đang xem: KPI, campaign, creative, geo, placement, tuổi-giới đều theo khoảng này. */
  dateRange: { since: string; until: string };
  /** `daily` kéo rộng hơn dateRange (thêm một kỳ liền trước) để tính delta; snapshot cũ không có. */
  dailyRange?: { since: string; until: string };
  /** Có khi Graph API lỗi và route trả snapshot thay thế. */
  stale?: { reason: string };
  daily: MetaDailyRow[];
  campaigns: MetaCampaignRow[];
  ads: MetaAdRow[];
  countries: MetaCountryRow[];
  placements: MetaPlacementRow[];
  demographics: MetaDemoRow[];
}
