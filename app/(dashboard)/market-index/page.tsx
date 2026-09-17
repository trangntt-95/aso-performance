import { MarketIndexCards } from '@/components/market-index/MarketIndexCards';
import { DataGapNote } from '@/components/shared/DataGapNote';
import { SheetSources } from '@/components/shared/SheetSources';
import { PageIntro } from '@/components/shared/PageIntro';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// What this screen reads, for the missing-data footnote at the bottom. Listed
// explicitly rather than inferred: a source left out simply goes unreported,
// which is safer than a note claiming data the page never touches.
const SOURCES: readonly DataSourceKey[] = [
  'historyDaily',
  'shopifyDaily',
  'googleAds',
  'countryTabs',
  'perGeoRevenue',
  'marketTiers',
];

export default function MarketIndexPage() {
  return (
    <div className="space-y-4">
      <PageIntro>
        <b>Sức khoẻ thị trường</b> — hai câu hỏi mà tab khác không trả lời. <b>Nửa trên:</b> cầu của thị
        trường đang lên hay xuống — users và install <b>theo ngày</b>, tách organic / paid, kỳ đang chọn so
        với kỳ liền trước cùng độ dài (nguồn GA4 History_Daily, đếm khi khách bấm vào listing); và install
        paid có đúng nhịp target không — <b>Shopify Ads cộng Google Ads</b> cùng kỳ so với target tháng.
        Toàn thị trường, không cân. <b>Nửa dưới:</b> nước nào đáng nặng — cân theo doanh thu (kỳ ghi trên
        tiêu đề) hay theo users L90, kèm nước nhiều traffic ít tiền và ngược lại. Overview cho ảnh chụp hôm
        nay; tab này cho hướng đi và nhịp.
      </PageIntro>
      <MarketIndexCards />
      <DataGapNote sources={SOURCES} />
      <SheetSources sources={SOURCES} />
    </div>
  );
}
