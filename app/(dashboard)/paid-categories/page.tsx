import { PaidCategoryBoardView } from '@/components/paid-categories/PaidCategoryBoardView';
import { DataGapNote } from '@/components/shared/DataGapNote';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// This screen reads one hand-built pivot in the Shopify Ads spreadsheet. Its
// only source is that spreadsheet, so the footnote below reports on the per-day
// feed from it — a stale export there means a stale pivot too.
const SOURCES: readonly DataSourceKey[] = ['shopifyDaily'];

export default function PaidCategoriesPage() {
  return (
    <div className="space-y-4">
      <PaidCategoryBoardView />
      <DataGapNote sources={SOURCES} />
    </div>
  );
}
