'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, Scale } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildRevenueWeighted } from '@/lib/market/revenueWeighted';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// The market verdict weighted by revenue, next to the sheet's own weighting.
//
// Both are shown. The sheet weights by search volume and this weights by what a
// country earns, and they disagree enough to change the reading — on some
// windows by tens of points, sometimes in the opposite direction. Replacing one
// number with the other silently would leave nobody able to say which verdict
// they had been looking at last week.
//
// See lib/market/revenueWeighted.ts for why search volume is the weaker basis:
// the sheet's own 'Δ Rank (Rev − Search)' column already exposes it.

const pct = (v: number | null): string =>
  v === null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

function tone(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return 'text-slate-400';
  if (Math.abs(v) < 0.02) return 'text-slate-600';
  return v > 0 ? 'text-emerald-600' : 'text-rose-600';
}

export function RevenueWeightedPanel() {
  const { data } = useSheetData();
  const report = useMemo(() => buildRevenueWeighted(data ?? null), [data]);
  const sheetByWindow = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of data?.marketIndex?.summary ?? []) m.set(r.window, r.deltaWeightedPct ?? null);
    return m;
  }, [data?.marketIndex?.summary]);
  const [open, setOpen] = useState<string | null>(null);

  if (!report) return null;
  const shown = report.windows.filter((w) => !w.unavailable);
  if (!shown.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 px-3 py-2">
        <Scale className="h-4 w-4 shrink-0 text-indigo-600" />
        <h2 className="text-sm font-semibold text-slate-900">Verdict theo doanh thu</h2>
        <span className="text-[11px] text-slate-500">
          trọng số = doanh thu nước đó ÷ doanh thu {report.base?.country}
        </span>
      </div>

      <div className="px-3 py-2">
        <div className="mb-2 text-[10.5px] leading-relaxed text-slate-500">
          Sheet cân theo <b>lượng search</b>: nước nào nhiều người tìm thì nặng. Bảng này cân theo{' '}
          <b>doanh thu</b>. Hai cách lệch nhau vì search không đi cùng tiền — chính sheet đã có cột{' '}
          <code className="text-[9px]">Δ Rank (Rev − Search)</code> để chỉ ra khoảng lệch đó.
          {report.contrast && (
            <>
              {' '}
              Ngay trong data hiện tại: 1 install ở <b>{report.contrast.rich.country}</b> đáng{' '}
              <b>${report.contrast.rich.valuePerInstall?.toFixed(2)}</b>, còn ở{' '}
              <b>{report.contrast.poor.country}</b> chỉ{' '}
              <b>${report.contrast.poor.valuePerInstall?.toFixed(2)}</b> — cân theo search thì hai
              nước này kéo verdict gần như bằng nhau.
            </>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr className="text-[10px] uppercase tracking-wide">
                <th className="px-2 py-1 text-left font-medium">Window</th>
                <th className="px-2 py-1 text-right font-medium">Chỉ số kỳ trước</th>
                <th className="px-2 py-1 text-right font-medium">Chỉ số kỳ này</th>
                <th className="px-2 py-1 text-right font-medium" title="Cân theo doanh thu">
                  Δ theo doanh thu
                </th>
                <th className="px-2 py-1 text-right font-medium" title="Cột Δ Weighted % của sheet, cân theo lượng search">
                  Δ sheet (search)
                </th>
                <th className="px-2 py-1 text-right font-medium" title="Phần users organic có trọng số. Thấp thì chỉ số mỏng.">
                  Phủ
                </th>
                <th className="px-2 py-1 text-left font-medium">Loại ra</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((w) => {
                const sheetDelta = sheetByWindow.get(w.window) ?? null;
                const isOpen = open === w.window;
                return (
                  <Fragment key={w.window}>
                    <tr
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => setOpen(isOpen ? null : w.window)}
                    >
                      <td className="whitespace-nowrap px-2 py-1.5 font-medium text-slate-800">
                        <span className="inline-flex items-center gap-1">
                          <ChevronDown
                            className={cn('h-3 w-3 text-slate-400 transition-transform', isOpen && 'rotate-180')}
                          />
                          {w.window}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">
                        {w.weightedP.toFixed(1)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-slate-800">
                        {w.weightedL.toFixed(1)}
                      </td>
                      <td className={cn('px-2 py-1.5 text-right font-mono text-[12px] font-semibold', tone(w.deltaPct))}>
                        {w.reliable ? pct(w.deltaPct) : <span className="text-slate-400">quá mỏng</span>}
                      </td>
                      <td className={cn('px-2 py-1.5 text-right font-mono text-[11px]', tone(sheetDelta))}>
                        {pct(sheetDelta)}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-1.5 text-right font-mono text-[11px]',
                          w.reliable ? 'text-slate-500' : 'text-amber-700',
                        )}
                        title={
                          w.reliable
                            ? undefined
                            : 'Dưới một nửa users organic có trọng số — phần lớn traffic nằm ngoài chỉ số này nên không kết luận.'
                        }
                      >
                        {Math.round(w.coverage * 100)}%
                      </td>
                      <td className="px-2 py-1.5 text-left text-[10px] text-slate-400">
                        {w.excluded.length === 0
                          ? '—'
                          : `${w.excluded.length} nước · ${w.excluded
                              .slice(0, 2)
                              .map((e) => e.country)
                              .join(', ')}${w.excluded.length > 2 ? '…' : ''}`}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={7} className="px-3 py-2">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                                Nước kéo chỉ số nhiều nhất
                              </div>
                              <ul className="space-y-0.5">
                                {w.contributors.slice(0, 6).map((c) => (
                                  <li key={c.country} className="flex items-baseline gap-2 text-[11px]">
                                    <span className="min-w-0 flex-1 truncate text-slate-700">{c.country}</span>
                                    <span
                                      className="shrink-0 font-mono text-[10px] text-slate-400"
                                      title={`Doanh thu ${formatNumber(Math.round(c.revenue))}`}
                                    >
                                      w {c.weight.toFixed(3)}
                                    </span>
                                    <span
                                      className="w-14 shrink-0 text-right font-mono text-[10px] text-slate-400"
                                      title="Doanh thu ÷ install của nước đó"
                                    >
                                      {c.valuePerInstall === null ? '—' : `${c.valuePerInstall.toFixed(0)}/inst`}
                                    </span>
                                    <span className="w-16 shrink-0 text-right font-mono text-slate-500">
                                      {c.usersP}→{c.usersL}
                                    </span>
                                    <span className="w-12 shrink-0 text-right font-mono font-medium text-slate-800">
                                      {(c.usersL * c.weight).toFixed(1)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                                Loại khỏi chỉ số — chưa có doanh thu
                              </div>
                              {w.excluded.length === 0 ? (
                                <div className="text-[11px] text-slate-400">Không nước nào.</div>
                              ) : (
                                <ul className="space-y-0.5">
                                  {w.excluded.slice(0, 6).map((e) => (
                                    <li key={e.country} className="flex items-baseline gap-2 text-[11px]">
                                      <span className="min-w-0 flex-1 truncate text-slate-600">{e.country}</span>
                                      <span className="shrink-0 font-mono text-slate-400">{e.usersL} users</span>
                                    </li>
                                  ))}
                                  {w.excluded.length > 6 && (
                                    <li className="text-[10px] text-slate-400">
                                      …+{w.excluded.length - 6} nước nữa
                                    </li>
                                  )}
                                </ul>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-[10px] leading-relaxed text-slate-400">
          {report.countriesWithRevenue} nước có doanh thu trong block RAW DATA của{' '}
          <code className="text-[9px]">PerGeo_CPI_Cap</code> (làm mới theo quý). Nước chưa có doanh
          thu nhận trọng số <b>0</b> — chưa sinh tiền thì không kéo verdict, nhưng cũng nghĩa là một
          thị trường mới nổi sẽ không được tính cho tới khi có doanh thu đầu tiên. Cột{' '}
          <b>Loại ra</b> luôn nói rõ nước nào.{' '}
          <b>L365 không có</b> vì tab <code className="text-[9px]">Country_L365</code> đã bị xoá để
          không vượt giới hạn cell của sheet.
        </div>
      </div>
    </div>
  );
}
