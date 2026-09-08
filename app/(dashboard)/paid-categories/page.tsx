import { PaidCategoryBoardView } from '@/components/paid-categories/PaidCategoryBoardView';
import { DataGapNote } from '@/components/shared/DataGapNote';
import { PageIntro } from '@/components/shared/PageIntro';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// This screen reads one hand-built pivot in the Shopify Ads spreadsheet. Its
// only source is that spreadsheet, so the footnote below reports on the per-day
// feed from it — a stale export there means a stale pivot too.
const SOURCES: readonly DataSourceKey[] = ['shopifyDaily'];

export default function PaidCategoriesPage() {
  return (
    <div className="space-y-4">
      <PageIntro>
        <b>Paid theo category, 8 tháng</b> — đọc tab <code>By categories</code> bạn tự dựng trong
        sheet Shopify Ads. Mỗi đường là 1 metric của 1 category qua từng tháng; bấm nhãn để ẩn /
        hiện, đổi <b>Category</b> để soi riêng một nhóm, để <b>TOTAL</b> để xem toàn bộ paid. →
        dùng để thấy <b>xu hướng</b>: CPI đang xấu dần ở đâu, install rơi từ tháng nào. Không phải
        chỗ tra số của một ngày cụ thể — cái đó ở <b>Camp Health</b>.
      </PageIntro>
      <PaidCategoryBoardView />
      <DataGapNote sources={SOURCES} />
    </div>
  );
}
