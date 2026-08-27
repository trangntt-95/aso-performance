import { InstallOriginView } from '@/components/install-origin/InstallOriginView';
import { DataGapNote } from '@/components/shared/DataGapNote';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// What this screen reads, for the missing-data footnote at the bottom. Listed
// explicitly rather than inferred: a source left out simply goes unreported,
// which is safer than a note claiming data the page never touches.
const SOURCES: readonly DataSourceKey[] = [
  'allTabs',
  'countryTabs',
];

export default function InstallOriginPage() {
  return (
    <div className="space-y-4">
      <InstallOriginView />
      <DataGapNote sources={SOURCES} />
    </div>
  );
}
