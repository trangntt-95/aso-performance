'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildCategoryCpi, type CategoryCpiRow } from '@/lib/market/categoryCpi';
import {
  CapHead,
  CapSection,
  CapStat,
  CpiCell,
  GapCell,
  RELIABLE_INSTALLS,
  VerdictBadge,
  money,
  money2,
  type CapTone,
} from './capTable';
import { formatPercent } from '@/lib/utils/format';

// Actual CPI vs the ceiling, per CATEGORY — the grain bids are actually set at.
// Deliberately the same shape as the per-country table above it; the shared
// pieces live in capTable.tsx.
//
// Category is the finest grain this can be computed at honestly: a campaign
// belongs to exactly one category, so these are sums of campaign totals. The
// per-keyword version would require splitting a campaign's spend across ~45
// keywords with nothing in the data to divide by, so it isn't offered.

type Lens = 'all' | 'over' | 'no-cap';

const LENS_LABEL: Record<Lens, string> = {
  all: 'Tất cả category',
  over: 'Đang vượt trần',
  'no-cap': 'Chưa có trần',
};

function verdictOf(r: CategoryCpiRow): { label: string; tone: CapTone; title?: string } {
  if (r.cpi === null) {
    return r.spend > 0
      ? { label: 'Tiêu, 0 install', tone: 'bad', title: 'Có chi tiêu nhưng chưa install nào.' }
      : { label: 'Chưa chạy', tone: 'neutral' };
  }
  if (r.cpiCap === null) {
    return {
      label: 'Chưa có trần',
      tone: 'warn',
      title:
        'Không ô Country × Category nào của category này có cột CPI Act trong Max bid cap, nên không có gì để so.',
    };
  }
  if (r.vsCap !== null && r.vsCap > 0) return { label: 'Vượt trần', tone: 'bad' };
  return { label: 'Trong trần', tone: 'good' };
}

function Row({ r }: { r: CategoryCpiRow }) {
  const [open, setOpen] = useState(false);
  const v = verdictOf(r);
  const over = r.vsCap !== null && r.vsCap > 0;
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="whitespace-nowrap px-2 py-1.5">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 font-medium text-slate-800 hover:text-indigo-700"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {r.category}
          </button>
          <div className="pl-4 text-[9px] text-slate-400">
            {r.camps} camp
            {r.campsInferred > 0 && (
              <span
                className="ml-1 cursor-help text-amber-600"
                title={`${r.campsInferred} camp không có category trong Camp_Links / Master KW Lookup — category suy từ tên camp.`}
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
        <CpiCell cpi={r.cpi} over={over} />
        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">
          {money2(r.cpiCap)}
          {r.bidRec !== null && (
            <div
              className="cursor-help text-[9px] text-slate-400"
              title={`CPC thực ${money2(r.cpc)} so với Bid Rec trung bình ${money2(r.bidRec)}${
                r.vsBidRec !== null ? ` (${r.vsBidRec >= 0 ? '+' : ''}${Math.round(r.vsBidRec * 100)}%)` : ''
              }`}
            >
              bid rec {money2(r.bidRec)}
            </div>
          )}
        </td>
        <GapCell gap={r.vsCap} />
        <VerdictBadge label={v.label} tone={v.tone} title={v.title} />
      </tr>
      {open && (
        <tr className="bg-slate-50/60">
          <td colSpan={7} className="px-2 py-2">
            <div className="pl-5 text-[10px] uppercase tracking-wide text-slate-500">
              Camp chi nhiều nhất trong {r.category}
            </div>
            <ul className="mt-1 space-y-0.5 pl-5">
              {r.topCamps.map((c) => (
                <li key={c.camp} className="flex items-baseline gap-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate text-slate-700">{c.camp}</span>
                  <span className="shrink-0 font-mono text-slate-600">{money(c.spend)}</span>
                  <span className="w-14 shrink-0 text-right font-mono text-slate-500">{c.installs} ins</span>
                  <span
                    className={cnCpi(c.cpi, r.cpiCap)}
                    title={
                      c.installs > 0 && c.installs < RELIABLE_INSTALLS
                        ? `Chỉ ${c.installs} install — một mẫu, chưa phải tỷ lệ.`
                        : undefined
                    }
                  >
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

/** Camp CPI coloured against its own category's ceiling. */
function cnCpi(cpi: number | null, cap: number | null): string {
  const base = 'w-16 shrink-0 text-right font-mono';
  if (cpi === null) return `${base} text-slate-300`;
  if (cap !== null && cpi > cap) return `${base} font-semibold text-rose-600`;
  return `${base} text-slate-800`;
}

export function CategoryCpiPanel() {
  const { data, isLoading } = useSheetData();
  const report = useMemo(() => buildCategoryCpi(data), [data]);
  const [lens, setLens] = useState<Lens>('all');
  const pick = (v: Lens) => setLens((cur) => (cur === v ? 'all' : v));

  const rows = useMemo(() => {
    if (!report) return [];
    switch (lens) {
      case 'over':
        return report.rows.filter((r) => r.vsCap !== null && r.vsCap > 0);
      case 'no-cap':
        return report.rows.filter((r) => r.cpiCap === null);
      default:
        return report.rows;
    }
  }, [report, lens]);

  if (isLoading || !report || report.rows.length === 0) return null;
  const overCount = report.rows.filter((r) => r.vsCap !== null && r.vsCap > 0).length;
  const noCapCount = report.rows.filter((r) => r.cpiCap === null).length;

  return (
    <CapSection
      title="2 · Category nào đang trả quá trần CPI"
      summary={`${report.rows.length} category · ${money(report.totalSpend)} ÷ ${report.totalInstalls} install = ${money2(
        report.cpi,
      )}/install${report.range ? ` · ${report.range}` : ''}`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CapStat<Lens>
          label="Vượt trần"
          value={overCount}
          sub={`trên ${report.rows.length} category`}
          tone={overCount > 0 ? 'text-rose-600' : undefined}
          pick="over"
          active={lens === 'over'}
          onPick={pick}
        />
        <CapStat<Lens>
          label="Chưa có trần"
          value={noCapCount}
          sub="không có ô nào trong Max bid cap"
          tone={noCapCount > 0 ? 'text-amber-700' : undefined}
          pick="no-cap"
          active={lens === 'no-cap'}
          onPick={pick}
        />
        <CapStat label="Tổng chi" value={money(report.totalSpend)} sub={`${report.totalInstalls} install`} />
        {/* Spelled out as a division: "CPI chung" was read as the average of the
            rows below, but it is weighted by spend and so tracks the biggest
            spender, not the middle category. */}
        <CapStat
          label="CPI toàn bộ"
          value={money2(report.cpi)}
          sub={`${money(report.totalSpend)} ÷ ${report.totalInstalls} install`}
          title="Tổng chi ÷ tổng install của mọi category. KHÔNG phải trung bình các CPI trong bảng: có trọng số theo chi phí, nên category tiêu nhiều nhất chi phối nó."
        />
      </div>

      <div className="flex items-center gap-2">
        <select
          value={lens}
          onChange={(e) => setLens(e.target.value as Lens)}
          className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {(Object.keys(LENS_LABEL) as Lens[]).map((k) => (
            <option key={k} value={k}>
              {LENS_LABEL[k]}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-slate-500">{rows.length} category</span>
      </div>

      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="w-full text-xs">
          <CapHead nameLabel="Category" />
          <tbody>
            {rows.map((r) => (
              <Row key={r.category} r={r} />
            ))}
          </tbody>
        </table>
      </div>

    </CapSection>
  );
}
