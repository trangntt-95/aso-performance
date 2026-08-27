import { UnderbidView } from '@/components/underbid/UnderbidView';
import { DataGapNote } from '@/components/shared/DataGapNote';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// What this screen reads, for the missing-data footnote at the bottom. Listed
// explicitly rather than inferred: a source left out simply goes unreported,
// which is safer than a note claiming data the page never touches.
const SOURCES: readonly DataSourceKey[] = [
  'allTabs',
  'masterKwLookup',
  'pausedKw',
  'campLinks',
  'shopifyDaily',
  'historyDaily',
];

export default function UnderbidPage() {
  return (
    <div className="space-y-4">
      <UnderbidView />
      <DataGapNote sources={SOURCES} />
    </div>
  );
}
