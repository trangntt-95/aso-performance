'use client';

import { useMemo } from 'react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildCategoryCpi } from '@/lib/market/categoryCpi';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// Money per category, sat underneath the Category share donut.
//
// The donut answers "where is the DEMAND" — users and installs per category,
// from GA4 keyword data across both surfaces. This answers the other half:
// where the paid budget went and what it bought. Two different measurements of
// the same categories, which is why they're stacked rather than merged: a
// category can be a large share of demand and a small share of spend, and that
// gap is the point.
//
// Nothing here is allocated. A campaign belongs to exactly one category, so
// these are sums of campaign totals.

const money = (n: number) => `$${formatNumber(Math.round(n))}`;

export function CategoryCpiStrip({
  range,
  days,
}: {
  /** Page-level date filter, when one is active. */
  range?: { from: string; to: string } | null;
  /** Otherwise the page's window, in days. */
  days?: number | null;
}) {
  const { data } = useSheetData();
  const report = useMemo(() => buildCategoryCpi(data, { range, days }), [data, range, days]);
  if (!report || report.rows.length === 0) return null;

  const max = report.rows.reduce((m, r) => Math.max(m, r.spend), 0);

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Chi phí paid theo category
        </div>
        <div className="text-[10px] text-slate-500">
          {money(report.totalSpend)} · {report.totalInstalls} install
          {report.cpi !== null && ` · CPI chung $${report.cpi.toFixed(2)}`}
          {report.range && ` · ${report.range}`}
        </div>
      </div>

      <ul className="mt-2 space-y-1.5">
        {report.rows.map((r) => (
          <li key={r.category} className="flex items-center gap-2 text-[11px]">
            <span className="w-28 shrink-0 truncate text-slate-700" title={r.category}>
              {r.category}
            </span>
            <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-indigo-500"
                style={{ width: `${max > 0 ? (r.spend / max) * 100 : 0}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono tabular-nums text-slate-700">
              {money(r.spend)}
            </span>
            <span className="w-10 shrink-0 text-right font-mono tabular-nums text-slate-400">
              {formatPercent(r.spendShare)}
            </span>
            <span className="w-12 shrink-0 text-right font-mono tabular-nums text-slate-500">
              {r.installs || '—'} ins
            </span>
            <span
              className={cn(
                'w-16 shrink-0 text-right font-mono tabular-nums font-semibold',
                r.vsCap !== null && r.vsCap > 0 ? 'text-rose-600' : 'text-slate-800',
              )}
              title={
                r.cpi === null
                  ? 'Chưa có install nào để tính CPI'
                  : r.reliable
                    ? undefined
                    : `Chỉ ${r.installs} install — con số này là một mẫu, chưa phải tỷ lệ.`
              }
            >
              {r.cpi === null ? '—' : `$${r.cpi.toFixed(2)}`}
              {r.cpi !== null && !r.reliable && <span className="font-normal text-slate-400">★</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 text-[10px] leading-snug text-slate-400">
        Mỗi camp thuộc <b>đúng một</b> category nên đây là phép cộng, không phải chia. Vòng tròn phía trên là{' '}
        <b>nhu cầu</b> (users/install từ GA4, cả organic và paid); dòng này là <b>tiền</b> — một category chiếm nhiều
        nhu cầu mà ít chi phí, hoặc ngược lại, chính là chỗ đáng xem.
        {' '}<b>★</b> = dưới 3 install, CPI đó chỉ là một mẫu. Đối chiếu với trần CPI nằm ở tab Bid Recommendations.
        {' '}Khoảng ngày ghi ở trên là khoảng <b>thật sự có dữ liệu</b> export, không phải khoảng bạn chọn — export
        Shopify Ads thường về sau 1–2 ngày.
      </div>
    </div>
  );
}
