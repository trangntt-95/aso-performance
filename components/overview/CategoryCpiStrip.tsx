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

/** Signed change, or an em dash when there's no baseline to compare against. */
const delta = (v: number | null) =>
  v === null ? '—' : `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;

/** Spend and installs moving the SAME way is normal; moving apart is the signal.
 *  Colour follows installs, since that's the outcome — but the pair is what the
 *  reader is being pointed at, so both are shown together. */
function deltaTone(installDelta: number | null): string {
  if (installDelta === null) return 'text-slate-300';
  if (installDelta > 0.05) return 'text-emerald-600';
  if (installDelta < -0.05) return 'text-rose-600';
  return 'text-slate-400';
}

export function CategoryCpiStrip({
  range,
  days,
  activeCategory,
  onCategoryClick,
  unsupportedFilters,
}: {
  /** Page-level date filter, when one is active. */
  range?: { from: string; to: string } | null;
  /** Otherwise the page's window, in days. */
  days?: number | null;
  /** Category the whole page is focused on, so this strip agrees with it. */
  activeCategory?: string | null;
  /** Click a row to focus that category page-wide (click again to clear). */
  onCategoryClick?: (category: string) => void;
  /** Page filters this strip CANNOT apply, named so the numbers aren't read as
   *  filtered. Campaign spend has no country / keyword / surface breakdown —
   *  money exists per campaign per day and nothing splits it further. */
  unsupportedFilters?: string[];
}) {
  const { data } = useSheetData();
  const report = useMemo(() => buildCategoryCpi(data, { range, days }), [data, range, days]);
  if (!report) return null;

  // The window is newer than the export. Saying so beats disappearing: an empty
  // section reads as a bug, "the export only reaches the 20th" is an answer.
  if (report.rangeAheadOfData) {
    const ends = report.dataEndsAt ? report.dataEndsAt.split('-').reverse().join('/') : '?';
    return (
      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Chi phí paid theo category
        </div>
        <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
          Khoảng đang chọn (<b>{report.requestedRange}</b>) nằm sau ngày mới nhất của export Shopify Ads (
          <b>{ends}</b>), nên chưa có ngày nào để tính. Chọn window dài hơn, hoặc chạy lại export.
        </div>
      </div>
    );
  }
  if (report.rows.length === 0) return null;

  // A page-level category focus dims the others rather than hiding them: the
  // share of spend only means something against the full set.
  const max = report.rows.reduce((m, r) => Math.max(m, r.spend), 0);
  const focused = (c: string) => !activeCategory || c === activeCategory;

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Chi phí paid theo category
        </div>
        {/* Written as the division it is. "CPI chung" read as if it were the
            average of the rows below, which it isn't — it's weighted by spend,
            so the biggest spender dominates it. */}
        <div className="text-[10px] text-slate-500">
          {report.cpi !== null ? (
            <span
              className="cursor-help"
              title={`Tổng chi ÷ tổng install của mọi category. KHÔNG phải trung bình các CPI ở dưới: con số này có trọng số theo chi phí, nên category tiêu nhiều nhất chi phối nó.`}
            >
              {money(report.totalSpend)} ÷ {report.totalInstalls} install ={' '}
              <b className="text-slate-700">${report.cpi.toFixed(2)}</b>/install
            </span>
          ) : (
            <>
              {money(report.totalSpend)} · chưa có install
            </>
          )}
          {report.range && ` · ${report.range}`}
          {report.hasPrev && report.prevRange && (
            <span className="cursor-help text-slate-400" title={`Kỳ so sánh: ${report.prevRange}`}>
              {' '}· vs {report.prevRange}
            </span>
          )}
        </div>
      </div>

      {unsupportedFilters && unsupportedFilters.length > 0 && (
        <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-900">
          Chưa lọc theo {unsupportedFilters.join(' / ')} — chi tiêu chỉ tồn tại ở mức camp theo ngày, không có chiều đó
          để tách. Số dưới đây là <b>toàn bộ</b> trong khoảng ngày đang chọn.
        </div>
      )}

      <ul className="mt-2 space-y-1.5">
        {report.rows.map((r) => {
          const isActive = activeCategory === r.category;
          const dim = !focused(r.category);
          const clickable = !!onCategoryClick && !r.category.startsWith('(');
          return (
          <li
            key={r.category}
            onClick={clickable ? () => onCategoryClick!(r.category) : undefined}
            className={cn(
              'flex items-center gap-2 rounded text-[11px] transition',
              clickable && 'cursor-pointer hover:bg-slate-50',
              isActive && 'bg-indigo-50/70 ring-1 ring-indigo-200',
              dim && 'opacity-40',
            )}
            title={clickable ? `Bấm để lọc cả trang theo category ${r.category}` : undefined}
          >
            <span
              className={cn('w-28 shrink-0 truncate', isActive ? 'font-semibold text-indigo-800' : 'text-slate-700')}
              title={r.category}
            >
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
            {/* Install vs the equal-length period before, with spend's own move in
                the tooltip: chi tăng mà install không theo là chỗ đáng xem. */}
            <span
              className={cn('w-20 shrink-0 text-right font-mono tabular-nums', deltaTone(r.installDelta))}
              title={
                report.hasPrev
                  ? `Install ${r.installsPrev} → ${r.installs} (${delta(r.installDelta)})` +
                    `\nChi ${money(r.spendPrev)} → ${money(r.spend)} (${delta(r.spendDelta)})` +
                    `\nCPI ${r.cpiPrev === null ? '—' : `$${r.cpiPrev.toFixed(2)}`} → ${
                      r.cpi === null ? '—' : `$${r.cpi.toFixed(2)}`
                    }` +
                    `\nKỳ so sánh: ${report.prevRange}`
                  : 'Kỳ trước không có dữ liệu nên chưa so được.'
              }
            >
              {r.installDelta === null ? (
                <span className="text-slate-300">—</span>
              ) : (
                <>
                  {delta(r.installDelta)}
                  <span className="ml-1 text-[9px] font-normal text-slate-400">
                    {r.installsPrev}→{r.installs}
                  </span>
                </>
              )}
            </span>
            <span
              className={cn(
                'w-16 shrink-0 text-right font-mono tabular-nums font-semibold',
                r.vsCap !== null && r.vsCap > 0 ? 'text-rose-600' : 'text-slate-800',
              )}
              title={r.cpi === null ? 'Chưa có install nào để tính CPI' : undefined}
            >
              {r.cpi === null ? '—' : `$${r.cpi.toFixed(2)}`}
            </span>
          </li>
          );
        })}
      </ul>

    </div>
  );
}
