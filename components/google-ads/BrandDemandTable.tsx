'use client';

import { useMemo, useState } from 'react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { brandDemand } from '@/lib/market/crossChannel';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { FX_NOTE } from '@/lib/config/fx';
import { cn } from '@/lib/utils';

// The same phrase, bought on two different surfaces.
//
// Google Ads search terms are matched against the App Store's own traffic for
// that phrase — the phrase is the only key the two systems share, since
// campaigns and keyword ids belong to entirely separate accounts.
//
// The organic column is the point of the table, not a decoration: a phrase with
// strong App Store organic traffic is demand already arriving for free on that
// surface, which changes what the Google spend on it is actually buying.

export function BrandDemandTable() {
  const { data } = useSheetData();
  const demand = useMemo(() => brandDemand(data), [data]);
  const [onlyPaidGoogle, setOnlyPaidGoogle] = useState(true);

  const rows = useMemo(() => {
    if (!demand) return [];
    return onlyPaidGoogle ? demand.rows.filter((r) => r.gCostNative > 0) : demand.rows;
  }, [demand, onlyPaidGoogle]);

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
              <th rowSpan={2} className="whitespace-nowrap border-r px-3 py-2 text-left font-medium">
                Cụm từ
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
              <th className="px-2 py-1 text-right font-medium">Chi phí</th>
              <th className="px-2 py-1 text-right font-medium">Clicks</th>
              <th className="border-r px-2 py-1 text-right font-medium">CPC</th>
              <th className="px-2 py-1 text-right font-medium">Users</th>
              <th className="border-r px-2 py-1 text-right font-medium">Install</th>
              <th className="px-2 py-1 text-right font-medium">Users</th>
              <th className="px-2 py-1 text-right font-medium">Install</th>
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
