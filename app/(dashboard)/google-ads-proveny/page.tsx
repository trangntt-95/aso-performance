import { Suspense } from 'react';
import { GoogleAdsView } from '@/components/google-ads/GoogleAdsView';

// Google Ads của app PROVENY. Sheet export riêng (GOOGLE_SHEET_ID_GADS_PROVENY),
// không đọc sheet ASO, không so với TrueProfit: không gắn DataGapNote / SheetSources.
export default function GoogleAdsProvenyPage() {
  return (
    <div className="space-y-4">
      {/* useSearchParams (lọc ngày ?from&to) cần Suspense khi render tĩnh. */}
      <Suspense fallback={null}>
        <GoogleAdsView account="proveny" />
      </Suspense>
    </div>
  );
}
