'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, LayoutGrid } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkline } from '@/components/shared/Sparkline';
import { categoryStyle } from '@/lib/utils/colors';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { PaidCategorySeries, PaidCategorySnapshot } from '@/lib/sheets/types';

// The 'By categories' pivot from the Shopify Ads spreadsheet, shown here.
//
// Trang built that tab herself; this screen READS it and lays it out. No number
// on this page is computed here — not even a total or a growth percentage, both
// of which the sheet already carries. That is the same rule the Bid
// Recommendations screens follow, and it exists so there is never a second set of
// figures disagreeing with the sheet. (There would be: the app's per-day feed is
// filtered to campaigns still live in the main sheet, so recomputing August from
// it gives $3,088 where the pivot says $3,154.)
//
// The columns are consecutive calendar months (confirmed by Trang 2026-09-08).
// The sheet dates only its last one, in A1, so the labels shown here are counted
// back from that month rather than read — see monthLabelsEndingAt. When A1 is not
// a whole month the back-count has no basis, and the sheet's own t1…t8 are shown
// instead; the note at the bottom says which of the two is on screen.

const money = (n: number | null): string =>
  n === null || !Number.isFinite(n) ? '—' : `$${n >= 100 ? Math.round(n) : n.toFixed(2)}`;
const pct = (n: number | null): string =>
  n === null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(1)}%`;
const pos = (n: number | null): string =>
  n === null || !Number.isFinite(n) ? '—' : n.toFixed(2);

/** The sheet's own '% growth' cell. Direction of "good" depends on the metric:
 *  for cost and position, lower is better. */
function Growth({ v, lowerIsBetter }: { v: number | null; lowerIsBetter?: boolean }) {
  if (v === null || !Number.isFinite(v)) return <span className="text-slate-300">—</span>;
  const flat = Math.abs(v) < 0.02;
  const good = lowerIsBetter ? v < 0 : v > 0;
  return (
    <span
      className={cn(
        'font-mono text-[11px] font-medium',
        flat ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-rose-600',
      )}
    >
      {v >= 0 ? '+' : ''}
      {Math.round(v * 100)}%
    </span>
  );
}

// Which way each tier reads. Spend is deliberately absent: more spend is neither
// good nor bad on its own, so colouring it would assert something the number
// doesn't say.
const LOWER_IS_BETTER: Record<string, boolean> = {
  CPI: true,
  CPC: true,
  Pos: true,
};
const NEUTRAL = new Set(['Spend', 'Impressions']);

/** How a tier's values should be written. Keyed on the sheet's own labels. */
function formatFor(metric: string): (n: number | null) => string {
  const m = metric.trim().toLowerCase();
  if (m === 'cpi' || m === 'cpc' || m === 'spend') return money;
  if (m === 'cr' || m === 'ctr') return pct;
  if (m === 'pos') return pos;
  return (n) => (n === null ? '—' : formatNumber(Math.round(n), { compact: true }));
}

function SnapshotTable({
  rows,
  total,
}: {
  rows: PaidCategorySnapshot[];
  total: PaidCategorySnapshot | null;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Category</th>
            <th className="px-2 py-2 text-right font-medium">Install</th>
            <th className="px-2 py-2 text-right font-medium">Chi</th>
            <th className="px-2 py-2 text-right font-medium">CPI</th>
            <th className="px-2 py-2 text-right font-medium">Clicks</th>
            <th className="px-2 py-2 text-right font-medium">Impressions</th>
            <th className="px-2 py-2 text-right font-medium">CR</th>
            <th className="px-2 py-2 text-right font-medium">CPC</th>
            <th className="px-2 py-2 text-right font-medium">CTR</th>
            <th className="px-2 py-2 text-right font-medium">Pos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cs = categoryStyle(r.category);
            // Spend with nothing to show for it is the one state on this table
            // worth marking: the sheet reports it as a blank CPI, which reads as
            // "no data" rather than "no installs".
            const dry = r.installs === 0 && r.spend > 0;
            return (
              <tr key={r.category} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                      cs.bg,
                      cs.text,
                    )}
                  >
                    {cs.emoji} {r.category}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px]">
                  <span className={r.installs > 0 ? 'font-medium text-emerald-700' : 'text-rose-600'}>
                    {r.installs}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-slate-800">
                  {money(r.spend)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[12px] font-semibold">
                  {dry ? (
                    <span
                      className="cursor-help text-rose-600"
                      title={`Sheet để trống CPI vì ${r.category} không có install nào trong kỳ này, dù đã tiêu ${money(r.spend)}.`}
                    >
                      0 install
                    </span>
                  ) : (
                    <span className="text-slate-900">{money(r.cpi)}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                  {formatNumber(r.clicks)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                  {formatNumber(r.impressions, { compact: true })}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                  {pct(r.cr)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                  {money(r.cpc)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                  {pct(r.ctr)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                  {pos(r.position)}
                </td>
              </tr>
            );
          })}
        </tbody>
        {total && (
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <tr>
              <td className="px-3 py-2 text-left text-[11px] text-slate-700">TOTAL</td>
              <td className="px-2 py-2 text-right font-mono text-[11px]">{total.installs}</td>
              <td className="px-2 py-2 text-right font-mono text-[11px]">{money(total.spend)}</td>
              <td className="px-2 py-2 text-right font-mono text-[12px]">{money(total.cpi)}</td>
              <td className="px-2 py-2 text-right font-mono text-[11px]">
                {formatNumber(total.clicks)}
              </td>
              <td className="px-2 py-2 text-right font-mono text-[11px]">
                {formatNumber(total.impressions, { compact: true })}
              </td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function TierTable({
  tier,
  periods,
  open,
  onToggle,
}: {
  tier: PaidCategorySeries;
  periods: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const fmt = formatFor(tier.metric);
  const lower = LOWER_IS_BETTER[tier.metric.trim()] ?? false;
  const neutral = NEUTRAL.has(tier.metric.trim());

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold text-slate-800">{tier.metric}</span>
        <span className="hidden text-[10px] text-slate-400 sm:inline">
          {tier.rows.length} category · {periods.length} kỳ
        </span>
        <ChevronDown
          className={cn(
            'ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Category</th>
                {periods.map((p) => (
                  <th key={p} className="px-2 py-1.5 text-right font-medium">
                    {p}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-medium">xu hướng</th>
                <th
                  className="px-2 py-1.5 text-right font-medium"
                  title="Cột '% growth' của chính sheet, không tính lại ở đây"
                >
                  % growth
                </th>
              </tr>
            </thead>
            <tbody>
              {tier.rows.map((r) => {
                const cs = categoryStyle(r.category);
                const pts = r.values.map((v, i) => ({ t: i, v }));
                return (
                  <tr key={r.category} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                          cs.bg,
                          cs.text,
                        )}
                      >
                        {cs.emoji} {r.category}
                      </span>
                    </td>
                    {r.values.map((v, i) => (
                      <td
                        key={i}
                        className={cn(
                          'whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px]',
                          i === r.values.length - 1
                            ? 'font-semibold text-slate-900'
                            : 'text-slate-500',
                        )}
                      >
                        {fmt(v)}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right">
                      <Sparkline points={pts} width={88} height={22} className="inline-block" />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      <Growth v={r.growth} lowerIsBetter={neutral ? undefined : lower} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {tier.totals.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr>
                  <td className="px-3 py-1.5 text-left text-[11px] font-semibold text-slate-700">
                    Tổng
                  </td>
                  {tier.totals.map((v, i) => (
                    <td
                      key={i}
                      className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-slate-700"
                    >
                      {fmt(v)}
                    </td>
                  ))}
                  <td />
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <Growth v={tier.totalsGrowth} lowerIsBetter={neutral ? undefined : lower} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

export function PaidCategoryBoardView() {
  const { data, isLoading, error } = useSheetData();
  const board = data?.paidCategoryBoard ?? null;
  // The two tiers a bid decision starts from open by default; the rest are there
  // when asked for, so the page isn't nine tables deep on arrival.
  const [openTiers, setOpenTiers] = useState<Record<string, boolean>>({
    INSTALLS: true,
    CPI: true,
  });
  const toggle = (m: string) => setOpenTiers((o) => ({ ...o, [m]: !o[m] }));

  // Month labels when they could be derived, the sheet's own otherwise.
  const labels = useMemo(
    () =>
      board
        ? board.periodMonths.length === board.periods.length
          ? board.periodMonths
          : board.periods
        : [],
    [board],
  );
  const usingMonths = !!board && board.periodMonths.length === board.periods.length;
  const lastPeriod = labels.length ? labels[labels.length - 1] : 't8';

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-red-500" />
        <div className="font-semibold">Couldn’t load sheet data</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
        <LayoutGrid className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        <div className="text-sm font-semibold text-slate-700">
          Chưa đọc được tab &ldquo;By categories&rdquo;
        </div>
        <div className="mx-auto mt-1 max-w-md text-[11px] leading-snug text-slate-500">
          Tab này nằm trong sheet Shopify Ads (<code className="text-[10px]">GOOGLE_SHEET_ID_SHOPIFY</code>).
          Trang trống khi tab bị đổi tên, bị xoá, hoặc sheet chưa share cho service account — xem{' '}
          <code className="text-[10px]">/api/shopify-schema</code> để biết là trường hợp nào.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
        <div className="text-[11px] leading-snug text-indigo-900">
          Đây là tab <b>By categories</b> bạn tự dựng trong sheet Shopify Ads, đọc nguyên và trình
          bày lại — <b>không tính lại số nào</b>, kể cả tổng và % growth. Sửa ở sheet thì trang này
          đổi theo (cache 10 phút).
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Snapshot theo category</h2>
          {board.from && board.to ? (
            <span className="font-mono text-[11px] text-slate-500">
              {board.from} → {board.to}
            </span>
          ) : (
            <span className="text-[11px] text-amber-700">A1 không đọc được khoảng ngày</span>
          )}
          <span className="text-[10px] text-slate-400">
            — khối bên trái của tab, cũng chính là kỳ <b>{lastPeriod}</b> ở các bảng dưới
          </span>
        </div>
        <SnapshotTable rows={board.snapshot} total={board.snapshotTotal} />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            {board.periods.length} kỳ theo từng chỉ số
          </h2>
          <span className="text-[10px] text-slate-400">
            — khối bên phải, {board.series.length} chỉ số · click để mở
          </span>
        </div>
        <div className="space-y-2">
          {board.series.map((t) => (
            <TierTable
              key={t.metric}
              tier={t}
              periods={labels}
              open={!!openTiers[t.metric]}
              onToggle={() => toggle(t.metric)}
            />
          ))}
        </div>
      </section>

      <div className="space-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] leading-snug text-slate-500">
        <div>
          <b>Về nhãn kỳ:</b> sheet chỉ ghi ngày cho kỳ cuối — ô A1 cho{' '}
          <span className="font-mono">
            {board.from || '?'} → {board.to || '?'}
          </span>
          , và cột cuối của bảng INSTALLS khớp đúng khối snapshot ở cả {board.snapshot.length}{' '}
          category, nên kỳ cuối chính là khoảng đó.{' '}
          {usingMonths ? (
            <>
              Các kỳ là <b>tháng liên tiếp</b>, nên nhãn <b>{labels.join(' · ')}</b> được{' '}
              <b>đếm lùi</b> từ tháng đó — không phải đọc từ sheet, và tự đúng khi sheet trượt sang
              tháng sau.
            </>
          ) : (
            <>
              A1 không phải một tháng trọn nên không đếm lùi được; trang đang hiện đúng tên sheet đặt
              (<b>{board.periods.join(', ')}</b>).
            </>
          )}
        </div>
        <div>
          <b>Không đối chiếu được với các trang khác:</b> feed per-day của dashboard bị lọc theo danh
          sách camp còn sống trong sheet chính, nên tính lại tháng 8 từ nó ra $3.088 trong khi tab
          này ghi $3.154. Số của tab là số của bạn — đó là lý do trang này đọc chứ không tính.
        </div>
        <div>
          <b>Taxonomy khác:</b> tab này gộp <code className="text-[9px]">Test, other</code> làm một
          nhóm, còn các trang khác tách <b>Test</b> và <b>Others</b> riêng theo{' '}
          <code className="text-[9px]">Max bid cap</code>. Đừng cộng số hai bên với nhau.
        </div>
      </div>
    </div>
  );
}
