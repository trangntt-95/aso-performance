'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ActionQueueRow, Category, Priority, RowStatus, SurfaceLabel } from '@/lib/sheets/types';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

export interface FilterState {
  search: string;
  priority: Priority | 'all';
  category: Category | 'all';
  surface: SurfaceLabel | 'all';
  country: string | 'all';
  alertPattern: 'all' | 'negative' | 'positive' | 'geo';
  status: RowStatus | 'all' | 'unresolved';
}

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  priority: 'all',
  category: 'all',
  surface: 'all',
  country: 'all',
  alertPattern: 'all',
  status: 'unresolved',
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
  { value: 'all', label: 'All alerts' },
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
        'px-2.5 py-1 rounded-full border text-xs transition shrink-0',
        active
          ? 'bg-slate-900 text-white border-gray-900'
          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400',
      )}
    >
      {children}
    </button>
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

  const set = <K extends keyof FilterState>(key: K, v: FilterState[K]) => onChange({ ...value, [key]: v });
  const dirty =
    value.search !== '' ||
    value.priority !== 'all' ||
    value.category !== 'all' ||
    value.surface !== 'all' ||
    value.country !== 'all' ||
    value.alertPattern !== 'all' ||
    value.status !== 'unresolved';

  return (
    <div className="space-y-2 sticky top-[57px] z-20 bg-slate-50 py-2 -mx-4 px-4 md:-mx-6 md:px-6 border-b">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          value={value.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search keyword, country, camp…"
          className="pl-8 h-9"
        />
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">Priority</span>
        {PRIORITIES.map((p) => (
          <Pill key={p.value} active={value.priority === p.value} onClick={() => set('priority', p.value)}>
            {p.label}
          </Pill>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">Surface</span>
        {SURFACES.map((s) => (
          <Pill key={s.value} active={value.surface === s.value} onClick={() => set('surface', s.value)}>
            {s.label}
          </Pill>
        ))}
        <span className="text-[10px] uppercase tracking-wide text-slate-500 ml-2 mr-1">Alert</span>
        {ALERT_PATTERNS.map((a) => (
          <Pill key={a.value} active={value.alertPattern === a.value} onClick={() => set('alertPattern', a.value)}>
            {a.label}
          </Pill>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">Status</span>
        {STATUSES.map((s) => (
          <Pill key={s.value} active={value.status === s.value} onClick={() => set('status', s.value)}>
            {s.label}
          </Pill>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">Category</span>
        <Pill active={value.category === 'all'} onClick={() => set('category', 'all')}>
          All
        </Pill>
        {categories.map((c) => (
          <Pill key={c} active={value.category === c} onClick={() => set('category', c as Category)}>
            {c}
          </Pill>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">Country</span>
        <Pill active={value.country === 'all'} onClick={() => set('country', 'all')}>
          All
        </Pill>
        {countries.map((c) => (
          <Pill key={c} active={value.country === c} onClick={() => set('country', c)}>
            {c}
          </Pill>
        ))}
        {dirty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 ml-auto text-xs gap-1"
            onClick={() => onChange(DEFAULT_FILTERS)}
          >
            <X className="h-3 w-3" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
