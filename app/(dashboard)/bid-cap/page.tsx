import { BidCapView } from '@/components/bid-cap/BidCapView';
import { DataGapNote } from '@/components/shared/DataGapNote';
import { SheetSources } from '@/components/shared/SheetSources';
import { PageIntro } from '@/components/shared/PageIntro';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// What this screen reads, for the missing-data footnote at the bottom. Listed
// explicitly rather than inferred: a source left out simply goes unreported,
// which is safer than a note claiming data the page never touches.
const SOURCES: readonly DataSourceKey[] = [
  'bidCap',
  'campLinks',
  'masterKwLookup',
  'pausedKw',
  'perGeoCpiCap',
  'perGeoRevenue',
  'marketTiers',
  'shopifyCamps',
  'shopifyDaily',
];

export default function BidCapPage() {
  return (
    <div className="space-y-4">
      <PageIntro>
        <b>Bid nên đặt bao nhiêu</b> — bảng chính là <code>Bid Rec ⭐</code> trong tab{' '}
        <code>Max bid cap</code>, ở grain <b>nước × category × keyword cluster</b>, cạnh bid đang set
        thật để thấy chỗ nào lệch. Ba phần bên trên là bối cảnh trước khi đổi bid:{' '}
        <b>trần CPI theo nước</b> so với <b>doanh thu ÷ install</b> của nước đó (trần cao hơn giá trị
        install thì mỗi install mua ở mức đó đều lỗ, camp chạy tốt tới đâu cũng vậy),{' '}
        <b>CPI theo category</b> — grain mà bid thật sự được set, và <b>alert camp target nhiều
        nước</b> mà bid rec các nước lệch nhau, vì một camp chỉ set được một bid. → dùng để trả lời
        “nên tăng/giảm bid ở đâu”, sau khi <code>Underbid</code> và <code>Overbid</code> đã chỉ ra
        chỗ cần sửa.
      </PageIntro>
      <BidCapView />
      <DataGapNote sources={SOURCES} />
      <SheetSources sources={SOURCES} />
    </div>
  );
}
