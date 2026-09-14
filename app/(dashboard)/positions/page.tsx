import { PositionsView } from '@/components/positions/PositionsView';
import { DataGapNote } from '@/components/shared/DataGapNote';
import { SheetSources } from '@/components/shared/SheetSources';
import type { DataSourceKey } from '@/lib/market/dataGaps';

// Vị trí keyword theo nước qua L3 → L90. Đọc các tab Country_L* và tier của
// nước từ Max bid cap; không đụng tới chi phí hay net value.
const SOURCES: readonly DataSourceKey[] = ['countryTabs', 'bidCap'];

export default function PositionsPage() {
  return (
    <div className="space-y-4">
      <PositionsView />
      <DataGapNote sources={SOURCES} />
      <SheetSources sources={SOURCES} />
    </div>
  );
}
