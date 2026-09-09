'use client';

import { Layers } from 'lucide-react';
import type { DynamicBasketItem } from '@/lib/sheets/types';
import type { WeightedBasketItem } from '@/lib/market/revenueWeighting';
import { Card, CardContent } from '@/components/ui/card';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// Rổ keyword — xếp theo tiền, không theo lượt tìm.
//
// Rổ của sheet là top keyword theo Users L90: một keyword toàn users India xếp
// trên một keyword ít users nhưng toàn US, dù cái sau mới là cái sinh doanh
// thu. Ở chế độ cân doanh thu, mỗi keyword được cộng users × share doanh thu
// của nước, nên thứ tự phản ánh tiền.
//
// Hạng cũ vẫn hiện bên cạnh khi nó khác: chênh lệch chính là thông tin — nó
// chỉ ra keyword nào đang được đánh giá cao hơn giá trị thật.

interface Props {
  /** Rổ gốc trong sheet (top theo Users L90). */
  data: DynamicBasketItem[];
  /** Có mặt khi trang cân theo doanh thu — thay hẳn rổ gốc. */
  weighted?: WeightedBasketItem[];
  /** Kỳ của block doanh thu, để ghi nguồn trọng số. */
  period?: string;
}

export function DynamicBasketCard({ data, weighted, period }: Props) {
  const useWeighted = !!weighted && weighted.length > 0;
  const items: (DynamicBasketItem | WeightedBasketItem)[] = useWeighted ? weighted! : data;
  if (items.length === 0) return null;

  const barOf = (d: DynamicBasketItem | WeightedBasketItem) =>
    useWeighted ? (d as WeightedBasketItem).index : d.l90Users;
  const maxBar = items.reduce((m, d) => Math.max(m, barOf(d)), 0);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-indigo-600" />
              Dynamic basket
              {useWeighted && (
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-normal text-indigo-700">
                  cân theo doanh thu
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-500">
              {useWeighted ? (
                <>
                  Top {items.length} keyword theo <b>Σ users × share doanh thu của nước</b> (L90)
                  {period ? ` · trọng số kỳ ${period}` : ''}
                </>
              ) : (
                <>
                  Top {items.length} keyword theo Users L90 — rổ được Apps Script dùng để tính
                  weighted verdict
                </>
              )}
            </p>
          </div>
        </div>
        <ol className="space-y-1">
          {items.map((d) => {
            const wd = useWeighted ? (d as WeightedBasketItem) : null;
            const moved = wd && wd.rawRank > 0 && wd.rawRank !== wd.rank ? wd.rawRank - wd.rank : 0;
            return (
              <li key={d.searchTerm} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-right font-mono text-[10px] text-slate-400 shrink-0">
                  {d.rank}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <KeywordLink keyword={d.searchTerm} className="font-medium truncate" />
                    {moved !== 0 && (
                      <span
                        className={cn(
                          'shrink-0 font-mono text-[9px]',
                          moved > 0 ? 'text-emerald-600' : 'text-rose-600',
                        )}
                        title={`Xếp theo users thô thì keyword này hạng ${wd!.rawRank}`}
                      >
                        {moved > 0 ? '▲' : '▼'}
                        {Math.abs(moved)}
                      </span>
                    )}
                  </div>
                  <div className="relative h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                    <div
                      className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full"
                      style={{ width: `${maxBar > 0 ? (barOf(d) / maxBar) * 100 : 0}%` }}
                    />
                  </div>
                  {wd && wd.topCountry && (
                    <div className="mt-0.5 truncate text-[9.5px] text-slate-400">
                      {wd.topCountry} chiếm {(wd.topCountryShare * 100).toFixed(0)}% chỉ số
                      {wd.unweightedUsers > 0 && (
                        <span title="Users của keyword này nằm ở nước chưa có doanh thu — không tính vào chỉ số">
                          {' '}
                          · {wd.unweightedUsers} u ở nước chưa có doanh thu
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="font-mono tabular-nums text-[12px] text-slate-700 shrink-0 w-16 text-right">
                  {wd ? (
                    <>
                      {wd.index.toFixed(1)}
                      <div className="text-[9px] text-slate-400">
                        {formatNumber(wd.rawUsers, { compact: true })} u
                      </div>
                    </>
                  ) : (
                    formatNumber(d.l90Users, { compact: true })
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        {useWeighted && (
          <p className="border-t pt-2 text-[10px] leading-relaxed text-slate-400">
            Chỉ số = Σ (users của keyword ở nước đó × share doanh thu của nước), đọc từ{' '}
            <code className="text-[9px]">Country_L90</code>. ▲▼ là chênh so với thứ tự cũ theo users
            thô. Keyword chỉ có users ở nước chưa có doanh thu sẽ không xuất hiện ở đây.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
