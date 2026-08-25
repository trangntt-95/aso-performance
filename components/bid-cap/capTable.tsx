'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// Shared parts for the two "actual vs ceiling" tables on this page — one by
// country, one by category.
//
// They answer the same question at two grains, so they were reading as two
// unrelated tables purely because each had grown its own column order, money
// format and way of showing "over the cap". Sharing the primitives is what keeps
// them the same; matching them by eye would drift again on the next edit.
//
// The agreed column order, left to right: what it is → how much it cost → what
// it bought → the rate → the ceiling → the gap → the verdict. Money before
// outcome before rate, because that's the order the numbers are read in.
//
// The two tables no longer measure the same thing, so each declares its columns.
// By category, spend is real: it comes from Shopify_daily, per campaign, and a
// campaign maps to a category. By country it is not — 'Max bid cap' dropped its
// Spend column in Aug 2026 and no tab breaks spend down per country, so that
// table compares two CEILINGS instead of a rate against a ceiling. Keeping one
// shared column list would have forced the country table to keep printing 'Chi'
// and 'CPI thực' headers over columns nothing can fill.

/** Whole dollars — for amounts, where cents are noise. */
export const money = (n: number) => `$${formatNumber(Math.round(n))}`;
/** Two decimals — for rates, where cents are the point. */
export const money2 = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);
/** Signed percentage gap. */
export const pctDelta = (n: number | null) =>
  n === null ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`;

/** Installs below this make a measured CPI a sample, not a rate. */
export const RELIABLE_INSTALLS = 3;

export interface CapCol {
  key: string;
  label: string;
  align: 'left' | 'right';
  /** Header tooltip — where a column needs to say what it is and isn't. */
  title?: string;
}

/** Columns for the by-CATEGORY table, which still has measured spend. */
export const CAP_COLS: CapCol[] = [
  { key: 'name', label: '', align: 'left' },
  { key: 'spend', label: 'Chi', align: 'right' },
  { key: 'installs', label: 'Install', align: 'right' },
  { key: 'cpi', label: 'CPI thực', align: 'right', title: 'Chi ÷ install, đo từ dữ liệu thật' },
  { key: 'cap', label: 'Trần', align: 'right', title: 'Mức trần đang đặt cho nhóm này' },
  { key: 'gap', label: 'vs trần', align: 'right' },
  { key: 'verdict', label: 'Trạng thái', align: 'left' },
];

/** Columns for the by-COUNTRY table, which compares two ceilings. */
export const COUNTRY_CAP_COLS: CapCol[] = [
  { key: 'name', label: '', align: 'left' },
  { key: 'bid', label: 'Bid rec', align: 'right', title: 'Bid trung bình sheet đề xuất cho nước này (Bid Rec ⭐), tính qua các category' },
  { key: 'installs', label: 'Install/mo', align: 'right', title: 'Inst/mo · trong ngoặc là Inst L90' },
  {
    key: 'sheetcap',
    label: 'Trần CPI sheet',
    align: 'right',
    title: "Trần CPI mà model bid đang chạy theo (cột 'CPI cap' của Max bid cap). Là mức CHO PHÉP, không phải CPI đã tiêu — sheet không còn cột Spend.",
  },
  { key: 'cap', label: 'Trần cấu hình', align: 'right', title: 'Trần CPI đã đặt trong PerGeo_CPI_Cap' },
  { key: 'gap', label: 'vs trần', align: 'right', title: 'Trần sheet so với trần cấu hình. Dương = model được phép trả cao hơn mức đã thống nhất.' },
  { key: 'verdict', label: 'Trạng thái', align: 'left' },
];

/** One header row, so a table's columns and its cells cannot drift apart. */
export function CapHead({
  nameLabel,
  extra,
  cols = CAP_COLS,
}: {
  nameLabel: string;
  extra?: React.ReactNode;
  cols?: CapCol[];
}) {
  return (
    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
      <tr>
        {cols.map((c) => (
          <th
            key={c.key}
            className={cn(
              'whitespace-nowrap px-2 py-1.5 font-medium',
              c.align === 'left' ? 'text-left' : 'text-right',
            )}
            title={c.title}
          >
            {c.key === 'name' ? nameLabel : c.label}
          </th>
        ))}
        {extra}
      </tr>
    </thead>
  );
}

/**
 * The measured rate. Deliberately unadorned: the install count it was divided by
 * sits in the column immediately left, so a "few installs" marker here repeated
 * what the reader can already see.
 */
export function CpiCell({ cpi, over }: { cpi: number | null; over: boolean }) {
  return (
    <td
      className={cn(
        'whitespace-nowrap px-2 py-1.5 text-right font-mono text-[12px] font-semibold',
        cpi === null ? 'text-slate-300' : over ? 'text-rose-600' : 'text-slate-900',
      )}
    >
      {money2(cpi)}
    </td>
  );
}

/** The gap between measured and ceiling, in one signed percentage. */
export function GapCell({ gap, title }: { gap: number | null; title?: string }) {
  const over = gap !== null && gap > 0;
  return (
    <td
      className={cn(
        'whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px]',
        gap === null ? 'text-slate-300' : over ? 'font-semibold text-rose-600' : 'text-emerald-700',
      )}
      title={title}
    >
      {pctDelta(gap)}
    </td>
  );
}

export type CapTone = 'bad' | 'warn' | 'good' | 'neutral';

const TONE: Record<CapTone, string> = {
  bad: 'border-rose-200 bg-rose-50 text-rose-700',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  good: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-500',
};

export function VerdictBadge({
  label,
  tone,
  title,
}: {
  label: string;
  tone: CapTone;
  title?: string;
}) {
  return (
    <td className="whitespace-nowrap px-2 py-1.5">
      <span
        className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', TONE[tone])}
        title={title}
      >
        {label}
      </span>
    </td>
  );
}

/** A headline number that is also the filter for it. */
export function CapStat<T extends string>({
  label,
  value,
  sub,
  tone,
  pick,
  active,
  onPick,
  title,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: string;
  pick?: T;
  active?: boolean;
  onPick?: (v: T) => void;
  title?: string;
}) {
  const clickable = pick !== undefined && !!onPick;
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      {...(clickable ? { type: 'button' as const, onClick: () => onPick!(pick as T) } : {})}
      title={title ?? (clickable ? 'Bấm để lọc bảng theo con số này' : undefined)}
      className={cn(
        'rounded border p-2 text-left transition',
        active ? 'border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-300' : 'border-slate-200',
        clickable && !active && 'hover:border-slate-400 hover:bg-slate-50',
      )}
    >
      <div className="flex items-baseline gap-1">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
        {active && <span className="text-[9px] font-semibold text-indigo-600">đang lọc</span>}
      </div>
      <div className={cn('text-lg font-semibold', tone ?? 'text-slate-800')}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </Tag>
  );
}

/** Collapsible frame, so both tables open and close the same way. */
export function CapSection({
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold text-slate-800">{title}</span>
        {summary && <span className="hidden min-w-0 truncate text-[10px] text-slate-500 sm:inline">{summary}</span>}
        <ChevronDown
          className={cn('ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && <div className="space-y-3 border-t border-slate-200 p-3">{children}</div>}
    </div>
  );
}
