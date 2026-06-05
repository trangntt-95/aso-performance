'use client';

import { useMemo, useState } from 'react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { useStatusStore, rowKeyOf } from '@/lib/store/statusStore';
import { PRIORITY_ORDER } from '@/lib/utils/colors';
import { buildPaidStatusIndex, resolvePaidStatus } from '@/lib/sheets/paidStatus';
import type { ActionQueueRow } from '@/lib/sheets/types';
import { ActionQueueRowItem } from './ActionQueueRow';
import { FiltersBar, DEFAULT_FILTERS, type FilterState } from './FiltersBar';
import { CopyKeywordsButton } from '@/components/shared/CopyKeywordsButton';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';

function matchesAlert(alert: string, pattern: FilterState['alertPattern']): boolean {
  if (pattern === 'all') return true;
  if (pattern === 'geo') return alert.startsWith('🎯');
  const negative = ['🚨', '⚠️', '💔', '💸', '📉'];
  const positive = ['🌱', '📈', '❤️', '💚', '🚀'];
  if (pattern === 'negative') return negative.some((c) => alert.startsWith(c));
  if (pattern === 'positive') return positive.some((c) => alert.startsWith(c));
  return true;
}

export function ActionQueueTable() {
  const { data, isLoading, error } = useSheetData();
  const statuses = useStatusStore((s) => s.statuses);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const allRows = useMemo(() => data?.actionQueue ?? [], [data]);

  const paidIndex = useMemo(
    () => buildPaidStatusIndex(data?.masterKwLookup ?? [], data?.kwAddedManual ?? [], data?.negativeKw ?? [], data?.pausedKw ?? []),
    [data?.masterKwLookup, data?.kwAddedManual, data?.negativeKw, data?.pausedKw],
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
        if (filters.paidStatus !== 'all') {
          const ps = resolvePaidStatus(r.keyword, paidIndex);
          if (filters.paidStatus === 'in_paid' && ps.source !== 'master') return false;
          if (filters.paidStatus === 'manual' && ps.source !== 'manual') return false;
          if (filters.paidStatus === 'paused' && ps.source !== 'paused') return false;
          // not_in_paid INCLUDES paused (camp tắt = đang không bid) but excludes negatives.
          if (filters.paidStatus === 'not_in_paid' && (ps.inPaid || ps.negative)) return false;
        }
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
  }, [allRows, filters, statuses, paidIndex]);

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
    <div className="space-y-3">
      <FiltersBar rows={allRows} value={filters} onChange={setFilters} />
      <div className="flex items-center gap-2 px-1">
        <div className="text-[11px] text-slate-500 flex-1">
          {isLoading
            ? 'Loading…'
            : `${filtered.length} of ${allRows.length} action${allRows.length === 1 ? '' : 's'}`}
        </div>
        {!isLoading && filtered.length > 0 && (
          <CopyKeywordsButton
            keywords={filtered.map((r) => r.keyword)}
            label={filters.paidStatus === 'not_in_paid' ? 'Copy Not-in-Paid kw' : 'Copy keywords'}
          />
        )}
      </div>
      <div className="border rounded-lg overflow-hidden bg-white">
        {isLoading && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
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
            <ActionQueueRowItem
              key={rowKeyOf(row)}
              row={row}
              paidStatus={resolvePaidStatus(row.keyword, paidIndex)}
            />
          ))}
      </div>
    </div>
  );
}
