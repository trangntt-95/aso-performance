'use client';

import { AlertCircle } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Skeleton } from '@/components/ui/skeleton';
import { DemandTrendSection } from './DemandTrendSection';
import { CountryWeightSection } from './CountryWeightSection';

// Market Health = hai câu hỏi, hai nửa.
//
// Nửa trên (DemandTrendSection): thị trường đang lên hay xuống — users và
// install theo ngày, organic / paid, so kỳ trước; và install paid có đúng nhịp
// target không (Shopify Ads + Google Ads). Toàn thị trường, không cân.
//
// Nửa dưới (CountryWeightSection): nước nào đáng nặng — trọng số theo tiền hay
// theo người, kèm nước lệch. Cân theo tiền ở nửa trên sẽ đổi câu hỏi mà vẫn
// giữ tên cũ, nên hai nửa tách nhau.
//
// 17/09/2026: bỏ executive summary, WoW, verdict theo core basket, funnel và
// narrative của tab Market_Index (Apps Script). Xem lib/market/marketHealth.ts.

export function MarketIndexCards() {
  const { data, isLoading, error } = useSheetData();

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-rose-500" />
        <div className="font-semibold">Không tải được Market Health</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-7xl space-y-5">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <DemandTrendSection data={data} />
      <CountryWeightSection data={data} />
    </div>
  );
}
