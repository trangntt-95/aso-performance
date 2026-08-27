import { BidCapView } from '@/components/bid-cap/BidCapView';
import { DataGapNote } from '@/components/shared/DataGapNote';
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
      <BidCapView />
      <DataGapNote sources={SOURCES} />
    </div>
  );
}
