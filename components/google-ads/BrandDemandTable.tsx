'use client';

import { useMemo, useState } from 'react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { brandDemand } from '@/lib/market/crossChannel';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { FX_NOTE } from '@/lib/config/fx';
import { cn } from '@/lib/utils';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { SortableTh } from '@/components/shared/SortableTh';

// The same phrase, bought on two different surfaces.
//
// Google Ads search terms are matched against the App Store's own traffic for
// that phrase — the phrase is the only key the two systems share, since
// campaigns and keyword ids belong to entirely separate accounts.
//
// The organic column is the point of the table, not a decoration: a phrase with
// strong App Store organic traffic is demand already arriving for free on that
// surface, which changes what the Google spend on it is actually buying.

// Sắp theo cột: bấm tiêu đề dòng dưới (useTableSort). Mặc định chi Google
// giảm — đúng thứ tự brandDemand() trả về. Cụm từ tăng A→Z; CPC rẻ hơn lên trước.
type SortKey = 'term' | 'gCost' | 'gClicks' | 'cpc' | 'paidUsers' | 'paidInstalls' | 'organicUsers' | 'organicInstalls';
const ASC_FIRST: readonly SortKey[] = ['term', 'cpc'];

export function BrandDemandTable() {
  const { data } = useSheetData();
  const demand = useMemo(() => brandDemand(data), [data]);
  const [onlyPaidGoogle, setOnlyPaidGoogle] = useState(true);

  const { sortKey, sortDir, toggle, sortRows } = useTableSort<SortKey>('gCost', { ascFirst: ASC_FIRST });

  const rows = useMemo(() => {
    if (!demand) return [];
    const list = onlyPaidGoogle ? demand.rows.filter((r) => r.gCostNative > 0) : demand.rows;
    return sortRows(list, (r, key) => {
      switch (key) {
        case 'term':
          return r.term;
        case 'gCost':
          return r.gCostNative;
        case 'gClicks':
          return r.gClicks;
        case 'cpc':
          return r.gClicks > 0 ? r.gCostNative / r.gClicks : null;
        case 'paidUsers':
          return r.asoPaidUsers;
        case 'paidInstalls':
          return r.asoPaidInstalls;
        case 'organicUsers':
          return r.asoOrganicUsers;
        case 'organicInstalls':
          return r.asoOrganicInstalls;
      }
    });
  }, [demand, onlyPaidGoogle, sortRows]);

  if (!demand || demand.rows.length === 0) return null;

  const money = (n: number) => `${formatNumber(Math.round(n), { compact: true })}₫`;
  const usd = (n: number | null) => (n === null ? '—' : `$${n.toFixed(0)}`);

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Cùng một cụm từ, hai bề mặt
        </div>
        <div className="mt-1 text-[11px] leading-snug text-slate-600">
          Cụm người dùng gõ trên <b>Google</b> đặt cạnh chính cụm đó trên <b>App Store</b>. Nối theo cụm từ — đó là khoá
          duy nhất hai hệ thống dùng chung.
          {demand.googleOnlyCostShare !== null && (
            <>
              {' '}
              <b className="text-amber-700">
                {formatPercent(demand.googleOnlyCostShare)} chi phí Google
              </b>{' '}
              đang đổ vào những cụm mà bên App Store <b>không có traffic paid nào</b>.
            </>
          )}
        </div>
        <div className="mt-1 text-[10px] text-slate-400">{FX_NOTE}</div>
        <button
          type="button"
          onClick={() => setOnlyPaidGoogle((v) => !v)}
          className="mt-2 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
        >
          {onlyPaidGoogle ? `Đang ẩn cụm chưa tốn tiền — hiện tất cả (${demand.rows.length})` : 'Chỉ hiện cụm có chi phí'}
        </button>
      </div>

      <div className="max-h-[60vh] overflow-auto rounded-lg border bg-white">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
            <tr>
              {/* rowSpan=2 nên không dùng SortableTh (không có prop rowSpan); nút bên trong
                  cư xử giống hệt: bấm để sắp, bấm lại đảo chiều, ▲/▼ khi đang sắp. */}
              <th
                rowSpan={2}
                aria-sort={sortKey === 'term' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="whitespace-nowrap border-r px-3 py-2 text-left font-medium"
              >
                <button
                  type="button"
                  onClick={() => toggle('term')}
                  title="Bấm để sắp theo cột này, bấm lại để đảo chiều"
                  className={cn(
                    'inline-flex cursor-pointer select-none items-start gap-0.5 font-medium hover:text-slate-900',
                    sortKey === 'term' && 'text-indigo-700',
                  )}
                >
                  <span>Cụm từ</span>
                  <span className="w-2 text-[9px] leading-4 text-indigo-600">
                    {sortKey === 'term' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th colSpan={3} className="border-r px-2 py-1 text-center font-medium text-indigo-700">
                Google (web search)
              </th>
              <th colSpan={2} className="border-r px-2 py-1 text-center font-medium text-slate-700">
                App Store — paid
              </th>
              <th colSpan={2} className="px-2 py-1 text-center font-medium text-emerald-700">
                App Store — organic
              </th>
            </tr>
            <tr className="text-[10px]">
              <SortableTh col="gCost" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" label="Chi phí" />
              <SortableTh col="gClicks" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" label="Clicks" />
              <SortableTh col="cpc" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="border-r px-2 py-1" label="CPC" />
              <SortableTh col="paidUsers" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" label="Users" />
              <SortableTh col="paidInstalls" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="border-r px-2 py-1" label="Install" />
              <SortableTh col="organicUsers" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" label="Users" />
              <SortableTh col="organicInstalls" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" label="Install" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cpc = r.gClicks > 0 ? r.gCostNative / r.gClicks : null;
              return (
                <tr key={r.term} className="border-t hover:bg-slate-50">
                  <td className="whitespace-nowrap border-r px-3 py-1.5">
                    <span className="font-medium text-slate-800">{r.term}</span>
                    {r.googleOnly && r.gCostNative > 0 && (
                      <span
                        className="ml-1.5 rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800"
                        title="Chỉ Google đang mua cụm này — bên App Store không ghi nhận traffic paid nào cho nó."
                      >
                        chỉ Google
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-slate-800">
                    {r.gCostNative > 0 ? money(r.gCostNative) : '—'}
                    {r.gCostUsd !== null && r.gCostNative > 0 && (
                      <span className="block text-[9px] font-normal text-slate-400">{usd(r.gCostUsd)}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">{r.gClicks || '—'}</td>
                  <td className="whitespace-nowrap border-r px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                    {cpc === null ? '—' : money(cpc)}
                  </td>
                  <td
                    className={cn(
                      'px-2 py-1.5 text-right font-mono text-[11px]',
                      r.asoPaidUsers > 0 ? 'text-slate-800' : 'text-slate-300',
                    )}
                  >
                    {r.asoPaidUsers || '—'}
                  </td>
                  <td
                    className={cn(
                      'border-r px-2 py-1.5 text-right font-mono text-[11px]',
                      r.asoPaidInstalls > 0 ? 'font-semibold text-slate-800' : 'text-slate-300',
                    )}
                  >
                    {r.asoPaidInstalls || '—'}
                  </td>
                  <td
                    className={cn(
                      'px-2 py-1.5 text-right font-mono text-[11px]',
                      r.asoOrganicUsers > 0 ? 'text-emerald-700' : 'text-slate-300',
                    )}
                  >
                    {r.asoOrganicUsers || '—'}
                  </td>
                  <td
                    className={cn(
                      'px-2 py-1.5 text-right font-mono text-[11px]',
                      r.asoOrganicInstalls > 0 ? 'font-semibold text-emerald-700' : 'text-slate-300',
                    )}
                  >
                    {r.asoOrganicInstalls || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t px-3 py-2 text-[10px] leading-snug text-slate-400">
          Số App Store lấy từ cửa sổ <b>L30</b>, Google lấy trọn khoảng export hiện có — hai cửa sổ khác nhau nên đọc
          theo <b>tương quan</b>, đừng trừ nhau. Cột <b>organic</b> là phần nhu cầu đã tự đến trên App Store mà không
          phải trả tiền: một cụm có organic mạnh mà vẫn tốn nhiều tiền bên Google là chỗ đáng xem lại trước tiên.
        </div>
      </div>
    </div>
  );
}
