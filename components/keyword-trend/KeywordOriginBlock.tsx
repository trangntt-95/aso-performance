'use client';

import { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildKeywordCampIndex, keywordCountryOrigin } from '@/lib/market/installOrigin';
import { formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// The Nguồn Install answer, narrowed to one keyword: which campaigns bid it and
// at what bid, and which countries the paid installs actually came from, at what
// position.
//
// The dashboard stays a dashboard — this is the same join asked one keyword at a
// time, so a click on a keyword doesn't require leaving the panel to find out
// where its installs came from.

function posTone(pos: number | null): string {
  if (pos === null) return 'text-slate-300';
  if (pos <= 2) return 'text-emerald-700 font-semibold';
  if (pos <= 5) return 'text-slate-800';
  return 'text-amber-700';
}

export function KeywordOriginBlock({ keyword }: { keyword: string }) {
  const { data } = useSheetData();

  const campIndex = useMemo(() => buildKeywordCampIndex(data), [data]);
  const camps = useMemo(() => campIndex.get(keyword), [campIndex, keyword]);
  const countries = useMemo(() => keywordCountryOrigin(data, keyword), [data, keyword]);

  const withInstalls = countries.filter((c) => c.installs > 0);
  const totalInstalls = withInstalls.reduce((s, c) => s + c.installs, 0);
  const nothing = camps.unknown && camps.paused.length === 0 && countries.length === 0;
  if (nothing) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-wide text-slate-500">Nguồn install · camp, bid, nước</h3>

      {camps.negative && (
        <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] leading-snug text-rose-800">
          Cụm này nằm trong <b>Negative KW list</b> nhưng vẫn có traffic paid trong kỳ. Negative áp theo từng camp —
          kiểm tra xem đã thêm ở mọi camp chưa, hoặc nó mới được thêm sau những lượt hiển thị này.
        </div>
      )}

      {/* --- camps + bid ------------------------------------------------- */}
      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Camp đang bid keyword này</div>
        {camps.unknown ? (
          <div className="mt-1 text-[11px] text-slate-400">
            Không có dòng nào trong <code className="text-[9px]">Master KW Lookup</code> — keyword này chưa được bid ở
            camp nào (hoặc chưa được thêm vào sheet).
          </div>
        ) : camps.live.length === 0 ? (
          <div className="mt-1 text-[11px] text-amber-700">
            Mọi camp bid keyword này đều đã tắt: {camps.paused.map((c) => c.camp).join(', ')}.
          </div>
        ) : (
          <>
            <ul className="mt-1 space-y-1">
              {camps.live.map((c) => (
                <li key={c.camp} className="flex items-baseline justify-between gap-2">
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-baseline gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                    >
                      {c.camp}
                      <ExternalLink className="h-2.5 w-2.5 shrink-0 self-center" />
                    </a>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-800">{c.camp}</span>
                  )}
                  <span className="shrink-0 font-mono text-[11px] text-slate-700">
                    {c.bidMax === null ? '—' : `$${c.bidMax.toFixed(2)}`}
                  </span>
                </li>
              ))}
            </ul>
            {camps.paused.length > 0 && (
              <ul className="mt-1 space-y-0.5 border-t border-slate-100 pt-1">
                {camps.paused.map((c) => (
                  <li key={c.camp} className="flex items-baseline justify-between gap-2 text-slate-400">
                    <span className="text-[10px] line-through">{c.camp}</span>
                    <span className="shrink-0 text-[9px]">đã tắt</span>
                  </li>
                ))}
              </ul>
            )}
            {camps.ambiguous && (
              <div className="mt-1.5 text-[10px] leading-snug text-amber-700">
                {camps.live.length} camp đang chạy cùng bid keyword này
                {camps.bidMin !== null && camps.bidMax !== null && camps.bidMin !== camps.bidMax
                  ? ` với bid từ $${camps.bidMin.toFixed(2)} đến $${camps.bidMax.toFixed(2)}`
                  : ''}
                . <code className="text-[9px]">Camp_Links</code> chưa điền cột Geo nên không xác định được camp nào phục
                vụ nước nào — bảng dưới không quy được install về một camp.
              </div>
            )}
          </>
        )}
      </div>

      {/* --- countries ---------------------------------------------------- */}
      {countries.length === 0 ? (
        <div className="rounded border border-dashed border-slate-200 px-3 py-3 text-center text-[11px] text-slate-400">
          Chưa có dòng paid nào ở mức <b>keyword × nước</b> cho keyword này trong <code>Country_L30</code>.
        </div>
      ) : (
        <div className="max-h-56 overflow-auto rounded border border-slate-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 [&_th]:bg-slate-50">
              <tr>
                <th className="whitespace-nowrap px-2 py-1 text-left font-medium">Nước</th>
                <th className="whitespace-nowrap px-2 py-1 text-right font-medium" title="Vị trí trung bình — nhỏ hơn là tốt hơn">
                  Vị trí
                </th>
                <th className="whitespace-nowrap px-2 py-1 text-right font-medium">Users</th>
                <th className="whitespace-nowrap px-2 py-1 text-right font-medium">Install</th>
                <th className="whitespace-nowrap px-2 py-1 text-right font-medium">CR</th>
              </tr>
            </thead>
            <tbody>
              {countries.map((c) => (
                <tr
                  key={c.country}
                  className={cn('border-t border-slate-100', c.installs > 0 ? 'bg-emerald-50/40' : undefined)}
                >
                  <td className="whitespace-nowrap px-2 py-1 text-[11px] text-slate-800">{c.country}</td>
                  <td className={cn('whitespace-nowrap px-2 py-1 text-right font-mono text-[11px]', posTone(c.position))}>
                    {c.position === null ? '—' : c.position.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-right font-mono text-[11px] text-slate-600">
                    {c.users || '—'}
                  </td>
                  <td
                    className={cn(
                      'whitespace-nowrap px-2 py-1 text-right font-mono text-[11px]',
                      c.installs > 0 ? 'font-semibold text-slate-900' : 'text-slate-300',
                    )}
                  >
                    {c.installs || '—'}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-right font-mono text-[11px] text-slate-500">
                    {c.cr === null || c.cr === 0 ? '—' : formatPercent(c.cr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[10px] leading-snug text-slate-400">
        {withInstalls.length > 0 ? (
          <>
            <b>{totalInstalls} install</b> truy được về {withInstalls.length} nước (dòng tô xanh). Cửa sổ L30, nguồn{' '}
            <code className="text-[9px]">Country_L30</code>.
          </>
        ) : (
          <>
            Chưa nước nào được GA4 gán install cho keyword này ở mức chi tiết — không có nghĩa là chưa có install, GA4
            giấu bớt hàng lượng thấp khi tách theo nước.
          </>
        )}{' '}
        <b>Bid</b> là max bid đang set trong Master KW Lookup, không phải giá thực trả cho một lượt click.
      </div>
    </section>
  );
}
