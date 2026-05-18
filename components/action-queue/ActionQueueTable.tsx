'use client';

import { useMemo, useState } from 'react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { useStatusStore, rowKeyOf } from '@/lib/store/statusStore';
import { PRIORITY_ORDER } from '@/lib/utils/colors';
import type { ActionQueueRow } from '@/lib/sheets/types';
import { ActionQueueRowItem } from './ActionQueueRow';
import { FiltersBar, DEFAULT_FILTERS, type FilterState } from './FiltersBar';
import { PriorityLegend } from './PriorityLegend';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { topP0Actions } from '@/components/overview/aggregate';
import { TopPriorityActionsBlock } from '@/components/overview/TopPriorityActionsBlock';

function matchesAlert(alert: string, pattern: FilterState['alertPattern']): boolean {
  if (pattern === 'all') return true;
  if (pattern === 'geo') return alert.startsWith('🎯');
  const negative = ['🚨', '⚠️', '💔', '💸', '📉'];
  const positive = ['🌱', '📈', '❤️', '💚', '🚀'];
  const firstChar = alert.charAt(0);
  if (pattern === 'negative') return negative.some((c) => alert.startsWith(c));
  if (pattern === 'positive') return positive.some((c) => alert.startsWith(c));
  void firstChar;
  return true;
}

export function ActionQueueTable() {
  const { data, isLoading, error } = useSheetData();
  const statuses = useStatusStore((s) => s.statuses);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const allRows = useMemo(() => data?.actionQueue ?? [], [data]);

  const topActionsAll = useMemo(() => topP0Actions(allRows), [allRows]);
  const topActionsPaid = useMemo(
    () => topActionsAll.filter((r) => r.surface === 'paid').slice(0, 5),
    [topActionsAll],
  );
  const topActionsOrganic = useMemo(
    () => topActionsAll.filter((r) => r.surface === 'organic').slice(0, 5),
    [topActionsAll],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return allRows
      .filter((r) => {
        if (filters.priority !== 'all' && r.priority !== filters.priority) return false;
        if (filters.category !== 'all' && r.category !== filters.category) return false;
        if (filters.surface !== 'all' && r.surface !== filters.surface) return false;
        if (filters.country !== 'all' && r.country !== filters.country) return false;
        if (!matchesAlert(r.alert, filters.alertPattern)) return false;
        if (q) {
          const hay = `${r.keyword} ${r.country} ${r.targetCamp} ${r.category} ${r.note}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        const rk = rowKeyOf(r);
        const st = statuses[rk]?.status ?? 'new';
        if (filters.status === 'unresolved') {
          if (st === 'done' || st === 'skipped') return false;
        } else if (filters.status !== 'all' && st !== filters.status) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 99;
        const pb = PRIORITY_ORDER[b.priority] ?? 99;
        if (pa !== pb) return pa - pb;
        return (b.score ?? 0) - (a.score ?? 0);
      });
  }, [allRows, filters, statuses]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
        <div className="font-semibold mb-1">Couldn’t load sheet data</div>
        <div className="text-sm text-slate-600 max-w-md">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-end justify-between gap-3 px-4 pt-3 pb-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Top priority actions this week</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              P0 + P1 từ daily ASO tracker, sort theo urgency score. Đã loại Vietnam + India (luôn exclude khỏi paid ads). Score = severity × volume × surface.
            </p>
          </div>
        </header>
        <div className="px-4 pb-4">
          <TopPriorityActionsBlock
            paid={topActionsPaid}
            organic={topActionsOrganic}
            isLoading={isLoading}
            emptyAll={!isLoading && topActionsAll.length === 0}
          />
        </div>
      </section>

      <PriorityLegend />
      <FiltersBar rows={allRows} value={filters} onChange={setFilters} />
      <div className="text-xs text-slate-500 flex items-center justify-between px-1">
        <span>
          {isLoading
            ? 'Loading…'
            : `${filtered.length} of ${allRows.length} action${allRows.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="border rounded-lg overflow-hidden bg-white divide-y">
        {isLoading && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            No actions match these filters.
          </div>
        )}
        {!isLoading &&
          filtered.map((row: ActionQueueRow) => (
            <ActionQueueRowItem key={rowKeyOf(row)} row={row} />
          ))}
      </div>
    </div>
  );
}
