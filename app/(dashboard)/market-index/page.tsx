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
        <b>Sức khoẻ thị trường</b> — verdict theo từng window do Apps Script tính sẵn trong tab{' '}
        <code>Market_Index</code>, cộng <b>Dynamic basket</b> (top keyword theo Users L90, chính là
        rổ dùng để tính weighted verdict) và các nước lõi theo doanh thu. → dùng để trả lời “thị
        trường đang lên hay xuống” trước khi đi vào từng keyword. Toàn bộ số tính trong sheet,
        trang này chỉ đọc.
      </PageIntro>
      <MarketIndexCards />
      <DataGapNote sources={SOURCES} />
    </div>
  );
}
