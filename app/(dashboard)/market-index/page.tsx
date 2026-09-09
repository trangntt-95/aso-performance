import { MarketIndexCards } from '@/components/market-index/MarketIndexCards';
import { DataGapNote } from '@/components/shared/DataGapNote';
import { PageIntro } from '@/components/shared/PageIntro';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// What this screen reads, for the missing-data footnote at the bottom. Listed
// explicitly rather than inferred: a source left out simply goes unreported,
// which is safer than a note claiming data the page never touches.
const SOURCES: readonly DataSourceKey[] = [
  'marketIndex',
  'allTabs',
  'countryTabs',
  'perGeoCpiCap',
  'perGeoRevenue',
  'marketTiers',
];

export default function MarketIndexPage() {
  return (
    <div className="space-y-4">
      <PageIntro>
        <b>Sức khoẻ thị trường</b> — thị trường đang lên hay xuống, trước khi đi vào từng keyword.
        Mặc định mọi bảng ở đây <b>cân theo doanh thu của nước</b>: nước sinh nhiều tiền thì nặng,
        nước chưa có doanh thu không kéo verdict. Công tắc <b>Thô</b> ở đầu trang trả về cách đếm
        cũ (mỗi user tính như nhau) để đối chiếu. Verdict/prose theo window vẫn do Apps Script viết
        trong tab <code>Market_Index</code>; phần cân theo doanh thu tính tại trang này từ{' '}
        <code>Country_Lx</code> và block doanh thu trong <code>PerGeo_CPI_Cap</code>.
      </PageIntro>
      <MarketIndexCards />
      <DataGapNote sources={SOURCES} />
    </div>
  );
}
