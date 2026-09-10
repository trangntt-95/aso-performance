import { PaidCoverageView } from '@/components/paid-coverage/PaidCoverageView';
import { UnbiddedSearchTerms } from '@/components/paid-coverage/UnbiddedSearchTerms';
import { DataGapNote } from '@/components/shared/DataGapNote';
import { SheetSources } from '@/components/shared/SheetSources';
import { PageIntro } from '@/components/shared/PageIntro';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// What this screen reads, for the missing-data footnote at the bottom. Listed
// explicitly rather than inferred: a source left out simply goes unreported,
// which is safer than a note claiming data the page never touches.
const SOURCES: readonly DataSourceKey[] = [
  'allTabs',
  'countryTabs',
  'masterKwLookup',
  'pausedKw',
  'bidCap',
  'campLinks',
  'searchTermUnbidded',
];

export default function PaidCoveragePage() {
  return (
    <div className="space-y-4">
      <PageIntro>
        <b>Độ phủ paid của keyword</b> — mọi keyword từng có traffic (L7 ∪ L30 ∪ L90 ∪ L365) ×
        trạng thái bidding. Mặc định lọc <b>❌ Not in Paid (KHÔNG gồm ⏸)</b>: keyword có người tìm
        mà mình chưa mua, và cũng chưa từng tắt camp cho nó. → đây là danh sách <b>nên mở camp
        mới</b>. Keyword trong Negative list hoặc KW_Added_Manual đã bị ẩn khỏi tab này — chúng là
        quyết định đã ra rồi, không phải việc cần làm.
      </PageIntro>
      <PaidCoverageView />
      {/* Grain khác — câu tìm kiếm, không phải keyword — nên đứng riêng dưới
          bảng chính thay vì trộn vào bốn cột window của nó. */}
      <UnbiddedSearchTerms />
      <DataGapNote sources={SOURCES} />
      <SheetSources sources={SOURCES} />
    </div>
  );
}
