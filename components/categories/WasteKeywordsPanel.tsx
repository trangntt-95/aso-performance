'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildWasteReport, type WasteKeywordRow, type WasteWindow } from '@/lib/market/wasteKeywords';
import { useKeywordTrendStore } from '@/lib/store/keywordTrendStore';
import { cn } from '@/lib/utils';

// Paid keywords pulling traffic and returning no installs, that are STILL bid.
//
// The camp column is the point: without it the list is trivia, with it every row
// names the campaign to go and edit.

const THRESHOLDS = [3, 5, 10];
const WINDOWS: WasteWindow[] = ['L30', 'L90'];

function CampList({ row }: { row: WasteKeywordRow }) {
  const [open, setOpen] = useState(false);
  const first = row.camps[0];
  const rest = row.camps.slice(1);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1">
        {first.url ? (
          <a
            href={first.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-baseline gap-1 whitespace-nowrap text-[11px] font-medium text-indigo-600 hover:underline"
          >
            {first.camp}
            <ExternalLink className="h-2.5 w-2.5 shrink-0 self-center" />
          </a>
        ) : (
          <span className="whitespace-nowrap text-[11px] font-medium text-slate-800">{first.camp}</span>
        )}
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-600 hover:bg-slate-200"
          >
            +{rest.length}
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-1 space-y-0.5 border-l border-slate-200 pl-2">
          {rest.map((c) => (
            <li key={c.camp} className="flex items-baseline gap-1.5">
              {c.url ? (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap text-[10px] text-indigo-600 hover:underline"
                >
                  {c.camp}
                </a>
              ) : (
                <span className="whitespace-nowrap text-[10px] text-slate-600">{c.camp}</span>
              )}
              {c.bidMax !== null && (
                <span className="font-mono text-[9px] text-slate-400">${c.bidMax.toFixed(2)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WasteKeywordsPanel() {
  const { data } = useSheetData();
  const [threshold, setThreshold] = useState(5);
  const [window, setWindow] = useState<WasteWindow>('L30');
  const [open, setOpen] = useState(true);
  const openKeyword = useKeywordTrendStore((s) => s.openKeyword);

  const report = useMemo(
    () => buildWasteReport(data, threshold, window),
    [data, threshold, window],
  );

  if (!report) return null;

  return (
    <div
      className={cn(
        'rounded-lg border bg-white',
        report.rows.length > 0 ? 'border-amber-300' : 'border-slate-200',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <AlertTriangle
          className={cn('h-4 w-4 shrink-0', report.rows.length > 0 ? 'text-amber-600' : 'text-slate-300')}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
        >
          <span className="text-[12px] font-semibold text-slate-900">
            {report.rows.length} keyword đang đốt ngân sách mà vẫn được bid
          </span>
          <span className="truncate text-[10px] text-slate-500">
            ≥{report.threshold} users paid · 0 install · {report.window}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
        </button>
        <select
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="h-7 shrink-0 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          title="Số users paid tối thiểu để một keyword được coi là có mẫu, không phải trùng hợp"
        >
          {THRESHOLDS.map((t) => (
            <option key={t} value={t}>
              ≥{t} users
            </option>
          ))}
        </select>
        <select
          value={window}
          onChange={(e) => setWindow(e.target.value as WasteWindow)}
          className="h-7 shrink-0 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {WINDOWS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      {open && (
        <div className="space-y-2 border-t border-slate-200 p-3">
          {report.rows.length === 0 ? (
            <div className="py-4 text-center text-[11px] text-slate-400">
              Không có keyword nào đạt ≥{report.threshold} users paid mà vẫn 0 install trong {report.window}.
              {report.notBidCount > 0 && ` (${report.notBidCount} keyword đạt ngưỡng nhưng đã ngừng bid.)`}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Keyword</th>
                      <th
                        className="whitespace-nowrap px-2 py-1.5 text-right font-medium"
                        title="Người vào listing từ lượt bấm quảng cáo. App Store Ads không báo click hay chi phí ở mức keyword."
                      >
                        Users paid
                      </th>
                      <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Install</th>
                      <th
                        className="whitespace-nowrap px-2 py-1.5 text-right font-medium"
                        title="Cùng keyword nhưng từ organic — nếu organic vẫn ra install thì cắt paid không mất gì"
                      >
                        Organic
                      </th>
                      <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Bid</th>
                      <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Camp đang bid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.keyword} className="border-t border-slate-100 align-top hover:bg-slate-50">
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => openKeyword(r.keyword, { surface: 'paid' })}
                            className="text-[12px] font-medium text-indigo-600 hover:underline"
                          >
                            {r.keyword}
                          </button>
                          <div className="text-[9px] text-slate-400">
                            {r.category}
                            {r.negative && (
                              <span
                                className="ml-1 rounded bg-rose-100 px-1 font-semibold text-rose-700"
                                title="Đã nằm trong Negative KW list mà vẫn nhận traffic paid — kiểm tra negative đã áp ở mọi camp chưa."
                              >
                                negative
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[12px] font-semibold text-amber-700">
                          {r.users}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-300">0</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px]">
                          {r.organicUsers === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span className={r.organicInstalls > 0 ? 'text-emerald-700' : 'text-slate-500'}>
                              {r.organicUsers}u / {r.organicInstalls}i
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-700">
                          {r.bidMax === null
                            ? '—'
                            : r.bidMin !== null && r.bidMin !== r.bidMax
                              ? `$${r.bidMin.toFixed(2)}–${r.bidMax.toFixed(2)}`
                              : `$${r.bidMax.toFixed(2)}`}
                        </td>
                        <td className="max-w-[20rem] px-2 py-1.5">
                          <CampList row={r} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1 text-[10px] leading-snug text-slate-500">
                <div>
                  <b>Users paid</b> là số người vào listing từ lượt bấm quảng cáo — App Store Ads{' '}
                  <b>không</b> báo click hay chi phí ở mức keyword, nên không quy ra tiền được. Chỉ những keyword{' '}
                  <b>vẫn đang được bid</b> (có camp không nằm trong Paused_camp) mới hiện ở đây
                  {report.notBidCount > 0 && `; ${report.notBidCount} keyword khác đạt ngưỡng nhưng đã ngừng bid nên đã bỏ qua`}.
                </div>
                {report.organicConverters > 0 && (
                  <div className="text-emerald-700">
                    {report.organicConverters} trong số này <b>vẫn ra install từ organic</b>. Cắt bid ở đó không mất
                    install — nhu cầu vẫn tự đến, chỉ là không đáng trả tiền.
                  </div>
                )}
                <div>
                  Một keyword nằm ở nhiều camp thì liệt kê hết; số bid là max bid trong Master KW Lookup, không phải giá
                  thực trả.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
