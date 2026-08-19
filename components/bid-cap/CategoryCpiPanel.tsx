'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildCategoryCpi, type CategoryCpiRow } from '@/lib/market/categoryCpi';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// CPI per category, next to the ceiling that category is supposed to respect.
//
// Sits on the bid page because category is the grain bids are set at. The whole
// point is that nothing here is allocated: a campaign has exactly one category,
// so these are sums, not estimates. The per-keyword version of this table cannot
// be built honestly and deliberately isn't offered.

const money = (n: number) => `$${formatNumber(Math.round(n))}`;
const money2 = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`);

function Row({ r }: { r: CategoryCpiRow }) {
  const [open, setOpen] = useState(false);
  const overCap = r.vsCap !== null && r.vsCap > 0;
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="whitespace-nowrap px-2 py-1.5">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-800 hover:text-indigo-700"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {r.category}
          </button>
          <div className="pl-4 text-[9px] text-slate-400">
            {r.camps} camp
            {r.campsInferred > 0 && (
              <span
                className="ml-1 cursor-help text-amber-600"
                title={`${r.campsInferred} camp không có category trong Camp_Links / Master KW Lookup — category được suy từ tên camp.`}
              >
                · {r.campsInferred} suy từ tên
              </span>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-slate-800">
          {money(r.spend)}
          <div className="text-[9px] font-normal text-slate-400">{formatPercent(r.spendShare)}</div>
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-700">
          {r.installs || '—'}
        </td>
        <td
          className={cn(
            'whitespace-nowrap px-2 py-1.5 text-right font-mono text-[12px] font-semibold',
            overCap ? 'text-rose-600' : 'text-slate-900',
          )}
        >
          {money2(r.cpi)}
          {r.cpi !== null && !r.reliable && (
            <span
              className="ml-1 cursor-help text-[9px] font-normal text-slate-400"
              title={`Chỉ ${r.installs} install — con số này là một mẫu, chưa phải tỷ lệ.`}
            >
              ({r.installs}★)
            </span>
          )}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">
          {money2(r.cpiCap)}
        </td>
        <td
          className={cn(
            'whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px]',
            overCap ? 'font-semibold text-rose-600' : 'text-emerald-700',
          )}
        >
          {pct(r.vsCap)}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-700">
          {money2(r.cpc)}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">
          {money2(r.bidRec)}
        </td>
        <td
          className={cn(
            'whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px]',
            r.vsBidRec !== null && r.vsBidRec > 0 ? 'text-amber-700' : 'text-slate-500',
          )}
        >
          {pct(r.vsBidRec)}
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50/60">
          <td colSpan={9} className="px-2 py-2">
            <div className="pl-5 text-[10px] uppercase tracking-wide text-slate-500">
              Camp chi nhiều nhất trong {r.category}
            </div>
            <ul className="mt-1 space-y-0.5 pl-5">
              {r.topCamps.map((c) => (
                <li key={c.camp} className="flex items-baseline gap-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate text-slate-700">{c.camp}</span>
                  <span className="shrink-0 font-mono text-slate-600">{money(c.spend)}</span>
                  <span className="w-14 shrink-0 text-right font-mono text-slate-500">
                    {c.installs} ins
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-slate-800">
                    {money2(c.cpi)}
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

export function CategoryCpiPanel() {
  const { data, isLoading } = useSheetData();
  const report = useMemo(() => buildCategoryCpi(data), [data]);
  const [open, setOpen] = useState(true);

  if (isLoading || !report || report.rows.length === 0) return null;
  const overCount = report.rows.filter((r) => r.vsCap !== null && r.vsCap > 0).length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold text-slate-800">CPI theo category</span>
        <span className="hidden text-[10px] text-slate-500 sm:inline">
          — {report.rows.length} category · {money(report.totalSpend)} · CPI chung {money2(report.cpi)}
          {overCount > 0 && ` · ${overCount} category vượt trần`}
          {report.range && ` · ${report.range}`}
        </span>
        <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-200 p-3">
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Category</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Chi</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Install</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">CPI thực</th>
                  <th
                    className="whitespace-nowrap px-2 py-1.5 text-right font-medium"
                    title="Trung bình cột 'CPI Act' của các ô Country × Category thuộc category này, trong Max bid cap"
                  >
                    Trần CPI
                  </th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">vs trần</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">CPC thực</th>
                  <th
                    className="whitespace-nowrap px-2 py-1.5 text-right font-medium"
                    title="Trung bình 'Bid Rec ⭐' của các ô thuộc category này"
                  >
                    Bid rec
                  </th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">vs bid rec</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <Row key={r.category} r={r} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-1 text-[10px] leading-snug text-slate-500">
            <div>
              Mỗi camp thuộc <b>đúng một</b> category, nên các con số này là phép <b>cộng</b>, không phải chia hay
              ước lượng. Bấm vào tên category để xem camp nào đang kéo nó.
            </div>
            <div>
              <b>CPI theo keyword thì không làm được</b> và mình cố ý không dựng: tiền chỉ tồn tại ở mức camp, một camp
              chứa trung bình ~45 keyword, và không có gì trong dữ liệu nói chi tiêu chia thế nào giữa chúng. Chia đều
              hay chia theo users của GA4 đều tạo ra một con số trông như phép đo nhưng không phải.
            </div>
            {report.inferredCamps > 0 && (
              <div>
                {report.inferredCamps} camp không có category trong <code className="text-[9px]">Camp_Links</code> hay{' '}
                <code className="text-[9px]">Master KW Lookup</code> nên được suy từ tên camp — điền category cho chúng
                trong sheet sẽ chắc hơn.
              </div>
            )}
            {report.unknownSpend > 0 && (
              <div className="text-amber-700">
                {money(report.unknownSpend)} chưa quy được về category nào.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
