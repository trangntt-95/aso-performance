'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Target } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Skeleton } from '@/components/ui/skeleton';
import { CountryGroup } from './CountryGroup';
import { ExportCsvButton } from './ExportCsvButton';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ActionQueueRow } from '@/lib/sheets/types';

type Mode = 'all' | 'missing' | 'weak';

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'all', label: 'All 🎯' },
  { value: 'missing', label: 'PAID MISSING' },
  { value: 'weak', label: 'PAID WEAK' },
];

export function GeoOpportunityTable() {
  const { data, isLoading, error } = useSheetData();
  const [mode, setMode] = useState<Mode>('all');
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const rows = (data?.actionQueue ?? []).filter((r) => r.alert.startsWith('🎯'));
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (mode === 'missing' && !r.alert.includes('PAID MISSING')) return false;
      if (mode === 'weak' && !r.alert.includes('PAID WEAK')) return false;
      if (q) {
        const hay = `${r.keyword} ${r.country} ${r.targetCamp} ${r.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const map = new Map<string, ActionQueueRow[]>();
    filtered.forEach((r) => {
      const key = r.country || '(global)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries())
      .map(([country, list]) => ({
        country,
        rows: [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [data, mode, search]);

  const totalRows = useMemo(
    () => grouped.reduce((sum, g) => sum + g.rows.length, 0),
    [grouped],
  );
  const allRows = useMemo(() => grouped.flatMap((g) => g.rows), [grouped]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
        <div className="font-semibold">Couldn’t load geo opportunities</div>
        <div className="text-sm text-gray-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded p-3 text-xs text-blue-900">
        <Target className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          Rows where organic is strong but paid isn’t bidding (MISSING) or pos &gt; 3 (WEAK). Each row carries a
          suggested target camp + bid range from the sheet. Export per-country CSV to import into Shopify Ads.
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={cn(
                'px-2.5 py-1 rounded-full border text-xs transition',
                mode === m.value
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-8 max-w-xs"
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          <span>
            {totalRows} opp{totalRows === 1 ? '' : 's'} · {grouped.length} countr{grouped.length === 1 ? 'y' : 'ies'}
          </span>
          <ExportCsvButton rows={allRows} filename="geo-opportunity-all.csv" />
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="border rounded-lg bg-white py-16 text-center text-sm text-gray-500">
          No 🎯 opportunities match these filters.
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map(({ country, rows }) => (
            <CountryGroup key={country} country={country} rows={rows} />
          ))}
        </div>
      )}
    </div>
  );
}
