'use client';

import { useMemo } from 'react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildCategoryCpi } from '@/lib/market/categoryCpi';
import { buildCategoryNetValue } from '@/lib/market/cellNetValue';
import type { NetValuePick } from '@/lib/market/keywordNetValue';
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
/** ROAS dự kiến: dưới 1 là lỗ trong 120 ngày, 1–1.5 mới hoà, từ 1.5 mới đáng scale. */
function roasTone(roas: number | null): string {
  if (roas === null) return 'text-slate-300';
  if (roas < 1) return 'font-semibold text-rose-600';
  if (roas < 1.5) return 'text-amber-700';
  return 'font-semibold text-emerald-700';
}

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
  surface,
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
  /**
   * Bộ lọc kênh của trang. Chi phí không tách được theo kênh (chỉ có paid),
   * nhưng giá trị install thì có: không lọc → gộp cả organic + paid; lọc → đúng
   * kênh đó. Trang xác nhận 14/09/2026 muốn đúng như vậy.
   */
  surface?: 'all' | 'organic' | 'paid';
}) {
  const { data } = useSheetData();
  const report = useMemo(() => buildCategoryCpi(data, { range, days }), [data, range, days]);
  const pick: NetValuePick = surface === 'paid' || surface === 'organic' ? surface : 'all';
  const netValueByCat = useMemo(() => buildCategoryNetValue(data, pick), [data, pick]);
  const nvScope = data?.netValueScope ?? '';
  const pickLabel = pick === 'all' ? 'organic + paid' : pick === 'paid' ? 'chỉ paid' : 'chỉ organic';
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

  // Dòng TOTAL (Trang 20/10/2026): cộng thẳng các dòng ở trên. CPI tổng = chi ÷
  // install (chính là report.cpi, có trọng số theo chi). Value/inst tổng = tổng
  // net ÷ tổng install của các category có trong bảng, cũng là trọng số theo
  // install chứ không phải trung bình các ô.
  const total = (() => {
    const spend = report.rows.reduce((s, r) => s + r.spend, 0);
    const installs = report.rows.reduce((s, r) => s + r.installs, 0);
    const installsPrev = report.rows.reduce((s, r) => s + r.installsPrev, 0);
    const spendPrev = report.rows.reduce((s, r) => s + r.spendPrev, 0);
    let nvNet = 0;
    let nvInstalls = 0;
    for (const r of report.rows) {
      const nv = netValueByCat.get(r.category.trim().toLowerCase());
      if (nv && nv.netPerInstall !== null) {
        nvNet += nv.netValue;
        nvInstalls += nv.installs;
      }
    }
    const cpi = installs > 0 ? spend / installs : null;
    const netPerInstall = nvInstalls > 0 ? nvNet / nvInstalls : null;
    // ROAS tổng: cộng giá trị dự kiến của TỪNG category (install × value/inst
    // của chính nó) rồi chia tổng chi, không lấy value/inst chung nhân tổng install.
    let expectedValue = 0;
    for (const r of report.rows) {
      const nv = netValueByCat.get(r.category.trim().toLowerCase());
      if (nv && nv.netPerInstall !== null) expectedValue += r.installs * nv.netPerInstall;
    }
    return {
      expectedValue,
      roas: spend > 0 && expectedValue > 0 ? expectedValue / spend : null,
      spend,
      installs,
      installsPrev,
      spendPrev,
      installDelta: report.hasPrev && installsPrev > 0 ? (installs - installsPrev) / installsPrev : null,
      cpi,
      cpiPrev: installsPrev > 0 ? spendPrev / installsPrev : null,
      netPerInstall,
      nvInstalls,
      nvNet,
      over: cpi !== null && netPerInstall !== null && cpi > netPerInstall,
    };
  })();

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

      <div className="overflow-x-auto">
      <div className="min-w-[600px]">
      {/* Column headers. The rows are a flex strip, not a table, so the widths
          here are the same literals the cells use — they must move together.
          Without them the strip is seven unlabelled numbers and the reader has to
          guess which is spend and which is CPI. */}
      <div className="mt-2 flex items-center gap-2 border-b border-slate-100 pb-1 text-[9px] uppercase tracking-wide text-slate-400">
        <span className="w-24 shrink-0">Category</span>
        <span className="min-w-0 flex-1">tỉ lệ chi</span>
        <span className="w-14 shrink-0 text-right">Chi</span>
        <span className="w-10 shrink-0 text-right" title="% chi phí của category này trên tổng chi">
          %
        </span>
        <span className="w-12 shrink-0 text-right">Install</span>
        <span className="w-14 shrink-0 text-right" title="Thay đổi install so với kỳ trước liền kề, cùng độ dài">
          Δ install
        </span>
        <span className="w-14 shrink-0 text-right" title="Chi ÷ install. Đỏ = vượt trần CPI của category">
          CPI
        </span>
        <span
          className="w-14 shrink-0 text-right"
          title={`Một install của category này ĐÁNG bao nhiêu: net value (doanh thu − phí Shopify, chưa trừ ads) ÷ installs, gộp mọi nước và mọi keyword của category, ${pickLabel}. Nguồn: tab Net value per install${nvScope ? ` — ${nvScope}` : ''} (không đổi theo khoảng ngày của trang). Đỏ = CPI đang trả cao hơn giá trị. 'mỏng' = dưới 3 shop trả tiền.`}
        >
          Value/inst
        </span>
        <span
          className="w-12 shrink-0 text-right"
          title="ROAS dự kiến = (install × Value/inst) ÷ chi. Tức giá trị 4 tháng của số install mua được chia cho tiền đã trả. Dưới 1 = chưa hoàn vốn trong 120 ngày."
        >
          ROAS
        </span>
      </div>

      <ul className="mt-1 space-y-1.5">
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
              className={cn('w-24 shrink-0 truncate', isActive ? 'font-semibold text-indigo-800' : 'text-slate-700')}
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
              className={cn('w-14 shrink-0 text-right font-mono tabular-nums', deltaTone(r.installDelta))}
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
                'w-14 shrink-0 text-right font-mono tabular-nums font-semibold',
                r.vsCap !== null && r.vsCap > 0 ? 'text-rose-600' : 'text-slate-800',
              )}
              title={r.cpi === null ? 'Chưa có install nào để tính CPI' : undefined}
            >
              {r.cpi === null ? '—' : `$${r.cpi.toFixed(2)}`}
            </span>
            {(() => {
              const nv = netValueByCat.get(r.category.trim().toLowerCase()) ?? null;
              if (!nv || nv.netPerInstall === null) {
                return (
                  <span className="w-14 shrink-0 text-right font-mono text-slate-300" title="Tab Net value per install chưa có keyword nào của category này">
                    —
                  </span>
                );
              }
              const over = r.cpi !== null && r.cpi > nv.netPerInstall;
              return (
                <span
                  className={cn(
                    'w-14 shrink-0 text-right font-mono tabular-nums',
                    over ? 'font-semibold text-rose-600' : nv.thin ? 'text-amber-700' : 'font-medium text-indigo-700',
                  )}
                  title={
                    `${nv.installs} install · ${nv.payingShops} shop trả tiền · net $${Math.round(nv.netValue).toLocaleString()} (${pickLabel})` +
                    (over ? ` · CPI $${r.cpi!.toFixed(2)} cao hơn giá trị một install — mua đúng giá này vẫn lỗ` : '') +
                    (nv.thin ? ` — ${nv.thinReason}` : '')
                  }
                >
                  ${nv.netPerInstall.toFixed(0)}
                  {nv.thin && <span className="ml-0.5 text-[9px]">mỏng</span>}
                </span>
              );
            })()}
            {(() => {
              const nv = netValueByCat.get(r.category.trim().toLowerCase()) ?? null;
              const roas = nv && nv.netPerInstall !== null && r.spend > 0 ? (r.installs * nv.netPerInstall) / r.spend : null;
              return (
                <span
                  className={cn('w-12 shrink-0 text-right font-mono tabular-nums', roasTone(roas))}
                  title={
                    roas === null
                      ? 'Chưa có value hoặc chưa có chi để tính'
                      : `${r.installs} install × $${nv!.netPerInstall!.toFixed(0)} = $${Math.round(r.installs * nv!.netPerInstall!).toLocaleString()} giá trị 4 tháng ÷ chi ${money(r.spend)}`
                  }
                >
                  {roas === null ? '—' : `${roas.toFixed(1)}x`}
                </span>
              );
            })()}
          </li>
          );
        })}
        <li className="mt-1 flex items-center gap-2 border-t border-slate-200 pt-1.5 text-[11px] font-semibold text-slate-900">
          <span className="w-24 shrink-0">TOTAL</span>
          <div className="min-w-0 flex-1 text-[9px] font-normal text-slate-400">
            {report.rows.length} category
          </div>
          <span className="w-14 shrink-0 text-right font-mono tabular-nums">{money(total.spend)}</span>
          <span className="w-10 shrink-0 text-right font-mono tabular-nums text-slate-400">100%</span>
          <span className="w-12 shrink-0 text-right font-mono tabular-nums">{total.installs || '—'} ins</span>
          <span
            className={cn('w-14 shrink-0 text-right font-mono tabular-nums', deltaTone(total.installDelta))}
            title={
              report.hasPrev
                ? `Install ${total.installsPrev} → ${total.installs} (${delta(total.installDelta)})` +
                  `\nChi ${money(total.spendPrev)} → ${money(total.spend)}` +
                  `\nCPI ${total.cpiPrev === null ? '—' : `$${total.cpiPrev.toFixed(2)}`} → ${total.cpi === null ? '—' : `$${total.cpi.toFixed(2)}`}`
                : 'Kỳ trước không có dữ liệu nên chưa so được.'
            }
          >
            {total.installDelta === null ? (
              <span className="text-slate-300">—</span>
            ) : (
              <>
                {delta(total.installDelta)}
                <span className="ml-1 text-[9px] font-normal text-slate-400">
                  {total.installsPrev}→{total.installs}
                </span>
              </>
            )}
          </span>
          <span
            className={cn('w-14 shrink-0 text-right font-mono tabular-nums', total.over ? 'text-rose-600' : 'text-slate-900')}
            title="Tổng chi ÷ tổng install, trọng số theo chi"
          >
            {total.cpi === null ? '—' : `$${total.cpi.toFixed(2)}`}
          </span>
          <span
            className={cn('w-14 shrink-0 text-right font-mono tabular-nums', total.over ? 'text-rose-600' : 'text-indigo-700')}
            title={
              total.netPerInstall === null
                ? 'Chưa có category nào có value'
                : `Tổng net $${Math.round(total.nvNet).toLocaleString()} ÷ ${total.nvInstalls} install của các category trong bảng (${pickLabel}), trọng số theo install`
            }
          >
            {total.netPerInstall === null ? '—' : `$${total.netPerInstall.toFixed(0)}`}
          </span>
          <span
            className={cn('w-12 shrink-0 text-right font-mono tabular-nums', roasTone(total.roas))}
            title={
              total.roas === null
                ? 'Chưa đủ dữ liệu'
                : `Tổng giá trị 4 tháng của install từng category cộng lại ($${Math.round(total.expectedValue).toLocaleString()}) ÷ tổng chi ${money(total.spend)}`
            }
          >
            {total.roas === null ? '—' : `${total.roas.toFixed(1)}x`}
          </span>
        </li>
      </ul>
      </div>
      </div>
      <div className="mt-1.5 text-[9px] leading-snug text-slate-400">
        <b>Value/inst</b> = một install của category đáng bao nhiêu (tab Net value per install, {pickLabel}
        {nvScope ? `, ${nvScope}` : ''}); số LTV 4 tháng, không đổi theo khoảng ngày của trang · lọc surface ở trang chỉ tách được cột này, chi phí vẫn là toàn bộ paid ·{' '}
        <span className="text-rose-600">đỏ</span> = CPI cao hơn giá trị, <span className="text-amber-700">mỏng</span> = dưới 3 shop trả tiền
      </div>
    </div>
  );
}
