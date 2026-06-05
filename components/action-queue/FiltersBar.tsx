'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ActionQueueRow, Category, Priority, RowStatus, SurfaceLabel } from '@/lib/sheets/types';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

export type PaidStatusFilter = 'all' | 'in_paid' | 'manual' | 'paused' | 'not_in_paid';

export interface FilterState {
  search: string;
  priority: Priority | 'all';
  category: Category | 'all';
  surface: SurfaceLabel | 'all';
  country: string | 'all';
  alertPattern: 'all' | 'negative' | 'positive' | 'geo';
  status: RowStatus | 'all' | 'unresolved';
  paidStatus: PaidStatusFilter;
}

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  priority: 'all',
  category: 'all',
  surface: 'all',
  country: 'all',
  alertPattern: 'all',
  status: 'unresolved',
  paidStatus: 'all',
};

interface Props {
  rows: ActionQueueRow[];
  value: FilterState;
  onChange: (next: FilterState) => void;
}

const PRIORITIES: Array<{ value: FilterState['priority']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
  { value: 'P3', label: 'P3' },
];

const SURFACES: Array<{ value: FilterState['surface']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'organic', label: 'Organic' },
];

const ALERT_PATTERNS: Array<{ value: FilterState['alertPattern']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'negative', label: 'Negative' },
  { value: 'positive', label: 'Positive' },
  { value: 'geo', label: '🎯 Geo' },
];

const STATUSES: Array<{ value: FilterState['status']; label: string }> = [
  { value: 'unresolved', label: 'Unresolved' },
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'snoozed', label: 'Snoozed' },
];

const PAID_STATUSES: Array<{ value: PaidStatusFilter; label: string }> = [
  { value: 'all', label: 'Paid: All' },
  { value: 'in_paid', label: '📌 In Paid' },
  { value: 'manual', label: '✍️ Added (manual)' },
  { value: 'paused', label: '⏸ Paused camp' },
  { value: 'not_in_paid', label: '❌ Not in Paid (gồm ⏸)' },
];

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2 py-0.5 rounded-full border text-[11px] transition shrink-0',
        active
          ? 'bg-slate-900 text-white border-slate-900'
          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400',
      )}
    >
      {children}
    </button>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      title={label}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FiltersBar({ rows, value, onChange }: Props) {
  const { categories, countries } = useMemo(() => {
    const c = new Set<string>();
    const k = new Set<string>();
    rows.forEach((r) => {
      c.add(r.category);
      k.add(r.country);
    });
    return {
      categories: Array.from(c).sort(),
      countries: Array.from(k).sort(),
    };
  }, [rows]);

  const set = <K extends keyof FilterState>(key: K, v: FilterState[K]) =>
    onChange({ ...value, [key]: v });
  const dirty =
    value.search !== '' ||
    value.priority !== 'all' ||
    value.category !== 'all' ||
    value.surface !== 'all' ||
    value.country !== 'all' ||
    value.alertPattern !== 'all' ||
    value.status !== 'unresolved' ||
    value.paidStatus !== 'all';

  return (
    <div className="sticky top-[57px] z-20 bg-slate-50 py-2 -mx-4 px-4 md:-mx-6 md:px-6 border-b space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <Input
            value={value.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Search keyword, country, camp…"
            className="pl-7 h-8 text-sm"
          />
        </div>
        <Select
          value={value.status}
          onChange={(v) => set('status', v)}
          options={STATUSES}
          label="Status"
        />
        <Select
          value={value.category as string}
          onChange={(v) => set('category', v as Category | 'all')}
          options={[{ value: 'all', label: 'Category: All' }, ...categories.map((c) => ({ value: c, label: c }))]}
          label="Category"
        />
        <Select
          value={value.country}
          onChange={(v) => set('country', v)}
          options={[{ value: 'all', label: 'Country: All' }, ...countries.map((c) => ({ value: c, label: c }))]}
          label="Country"
        />
        <Select
          value={value.paidStatus}
          onChange={(v) => set('paidStatus', v)}
          options={PAID_STATUSES}
          label="Paid status (Master KW + Manual add)"
        />
        {dirty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onChange(DEFAULT_FILTERS)}
          >
            <X className="h-3 w-3" />
            Reset
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">P</span>
        {PRIORITIES.map((p) => (
          <Pill key={p.value} active={value.priority === p.value} onClick={() => set('priority', p.value)}>
            {p.label}
          </Pill>
        ))}
        <span className="text-[10px] uppercase tracking-wide text-slate-400 ml-2">Surface</span>
        {SURFACES.map((s) => (
          <Pill key={s.value} active={value.surface === s.value} onClick={() => set('surface', s.value)}>
            {s.label}
          </Pill>
        ))}
        <span className="text-[10px] uppercase tracking-wide text-slate-400 ml-2">Alert</span>
        {ALERT_PATTERNS.map((a) => (
          <Pill key={a.value} active={value.alertPattern === a.value} onClick={() => set('alertPattern', a.value)}>
            {a.label}
          </Pill>
        ))}
      </div>
    </div>
  );
}
