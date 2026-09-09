import { MarketIndexCards } from '@/components/market-index/MarketIndexCards';
import { DataGapNote } from '@/components/shared/DataGapNote';
import { SheetSources } from '@/components/shared/SheetSources';
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
        Trang chia làm hai nửa. <b>Nửa trên</b> (executive summary, WoW, verdict theo window,
        funnel, top keyword) là <b>toàn thị trường, không cân</b> — mỗi user tính như nhau, số do
        Apps Script tính trong tab <code>Market_Index</code> cộng tổng từ <code>All_Lx</code>.{' '}
        <b>Nửa dưới</b> (Trọng số quốc gia) mới cân, và cho chọn <b>cân theo doanh thu</b> hay{' '}
        <b>cân theo user</b> — kèm cảnh báo nước nhiều traffic ít tiền và nước nhiều tiền ít
        traffic. → “lên hay xuống” là câu hỏi về cả thị trường; “nước nào đáng nặng” là câu hỏi
        khác, nên hai câu để riêng.
      </PageIntro>
      <MarketIndexCards />
      <DataGapNote sources={SOURCES} />
      <SheetSources sources={SOURCES} />
    </div>
  );
}
