import { ChangelogView } from '@/components/changelog/ChangelogView';
import { DataGapNote } from '@/components/shared/DataGapNote';
import { SheetSources } from '@/components/shared/SheetSources';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// What this screen reads, for the missing-data footnote at the bottom. Listed
// explicitly rather than inferred: a source left out simply goes unreported,
// which is safer than a note claiming data the page never touches.
//
// Ba source này chỉ dựng dropdown (category, nước, tier). Bản thân change log
// nằm ở tab App_Notes, đọc qua /api/notes chứ không qua payload — nên nó không
// có DataSourceKey và được nêu riêng ở footer nguồn.
const SOURCES: readonly DataSourceKey[] = [
  'campLinks',
  'marketTiers',
  'perGeoRevenue',
];

export default function ChangelogPage() {
  return (
    <div className="space-y-4">
      <ChangelogView />
      <DataGapNote sources={SOURCES} />
      <SheetSources sources={SOURCES} extra={['App_Notes']} />
    </div>
  );
}
