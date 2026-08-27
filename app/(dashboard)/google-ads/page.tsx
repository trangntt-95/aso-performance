import { GoogleAdsView } from '@/components/google-ads/GoogleAdsView';
import { DataGapNote } from '@/components/shared/DataGapNote';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// What this screen reads, for the missing-data footnote at the bottom. Listed
// explicitly rather than inferred: a source left out simply goes unreported,
// which is safer than a note claiming data the page never touches.
const SOURCES: readonly DataSourceKey[] = [
  'googleAds',
];

export default function GoogleAdsPage() {
  return (
    <div className="space-y-4">
      <GoogleAdsView />
      <DataGapNote sources={SOURCES} />
    </div>
  );
}
