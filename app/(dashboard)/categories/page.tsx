import { CategoryDrilldown } from '@/components/categories/CategoryDrilldown';
import { DataGapNote } from '@/components/shared/DataGapNote';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// What this screen reads, for the missing-data footnote at the bottom. Listed
// explicitly rather than inferred: a source left out simply goes unreported,
// which is safer than a note claiming data the page never touches.
const SOURCES: readonly DataSourceKey[] = [
  'allTabs',
  'countryTabs',
  'masterKwLookup',
  'pausedKw',
];

export default function CategoriesPage() {
  // Flat view: every keyword across all categories, with a category filter.
  return (
    <div className="space-y-4">
      <CategoryDrilldown />
      <DataGapNote sources={SOURCES} />
    </div>
  );
}
