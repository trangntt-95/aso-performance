import { MetaProvenyView } from '@/components/meta-proveny/MetaProvenyView';

// Meta Ads của app PROVENY. Account quảng cáo riêng của FireGroup, không đọc
// sheet ASO, không liên quan TrueProfit: không gắn DataGapNote / SheetSources.
export default function MetaProvenyPage() {
  return (
    <div className="space-y-4">
      <MetaProvenyView />
    </div>
  );
}
