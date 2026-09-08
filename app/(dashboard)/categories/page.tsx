import { CategoryDrilldown } from '@/components/categories/CategoryDrilldown';
import { DataGapNote } from '@/components/shared/DataGapNote';
import { PageIntro } from '@/components/shared/PageIntro';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// What this screen reads, for the missing-data footnote at the bottom. Listed
// explicitly rather than inferred: a source left out simply goes unreported,
// which is safer than a note claiming data the page never touches.
const SOURCES: readonly DataSourceKey[] = ['allTabs', 'countryTabs', 'masterKwLookup', 'pausedKw'];

export default function CategoriesPage() {
  // Flat view: every keyword across all categories, with a category filter.
  return (
    <div className="space-y-4">
      <PageIntro>
        <b>Từng keyword, mọi category</b> — bảng chi tiết nhất trong dashboard: users / install /
        CR / vị trí theo từng window, kèm nước nào ra traffic và keyword đó có đang được bid không.
        → dùng khi đã biết cần xem keyword nào và muốn tra số của nó, hoặc cần lọc ra một nhóm
        keyword theo ngưỡng. Khối cảnh báo phía trên bảng là keyword <b>đang tốn tiền paid mà không
        ra install</b>.
      </PageIntro>
      <CategoryDrilldown />
      <DataGapNote sources={SOURCES} />
    </div>
  );
}
