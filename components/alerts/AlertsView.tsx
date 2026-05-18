'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Calendar } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import type { AlertLogRow } from '@/lib/sheets/types';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber, parseSheetDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

const DAYS_OPTIONS = [
  { value: 7, label: '7 ngày' },
  { value: 14, label: '14 ngày' },
  { value: 30, label: '30 ngày' },
  { value: 90, label: '90 ngày' },
] as const;

function dateKey(v: string | number): string {
  const d = parseSheetDate(v);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function formatDateShort(v: string | number): string {
  const d = parseSheetDate(v);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

interface FilterState {
  days: number;
  country: string;
  keyword: string;
}

const DEFAULT_FILTERS: FilterState = { days: 30, country: 'all', keyword: '' };

export function AlertsView() {
  const { data, isLoading, error } = useSheetData();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const rows = useMemo(() => data?.alertLog ?? [], [data]);

  const cutoffMs = useMemo(() => Date.now() - filters.days * 86400000, [filters.days]);

  const countries = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      if (r.country) s.add(r.country);
    });
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filters.keyword.trim().toLowerCase();
    return rows
      .filter((r) => {
        const d = parseSheetDate(r.snapshotDate);
        if (!d || d.getTime() < cutoffMs) return false;
        if (filters.country !== 'all' && r.country !== filters.country) return false;
        if (q && !r.keyword.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const da = parseSheetDate(a.snapshotDate)?.getTime() ?? 0;
        const db = parseSheetDate(b.snapshotDate)?.getTime() ?? 0;
        if (da !== db) return db - da; // newest first
        return (b.deltaPos ?? 0) - (a.deltaPos ?? 0);
      });
  }, [rows, filters, cutoffMs]);

  const grouped = useMemo(() => {
    const map = new Map<string, AlertLogRow[]>();
    filtered.forEach((r) => {
      const k = dateKey(r.snapshotDate);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const stats = useMemo(() => {
    const days = grouped.length;
    const total = filtered.length;
    const uniqKw = new Set(filtered.map((r) => r.keyword)).size;
    return { days, total, uniqKw };
  }, [filtered, grouped]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
        <div className="font-semibold">Couldn’t load alert log</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-500" />
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
            Rank drop alerts
          </h1>
        </div>
        <p className="text-sm text-slate-600 max-w-3xl">
          Lịch sử các rank drop trên paid search ads cho top 20 keyword theo contribution
          (union L3 → L90). Apps Script ghi mới mỗi sáng 7h, alert qua email
          <code className="ml-1 px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">trangnt@firegroup.io</code>.
        </p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
          <>
            <StatTile label="Alerts" value={stats.total} hint={`trong ${filters.days} ngày`} />
            <StatTile label="Unique keywords" value={stats.uniqKw} hint="bị tụt rank" />
            <StatTile label="Ngày có alert" value={stats.days} hint={`/ ${filters.days} ngày`} />
          </>
        )}
      </section>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-900">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium block mb-1">
                Khung thời gian
              </label>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
                {DAYS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, days: opt.value }))}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium transition',
                      filters.days === opt.value
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium block mb-1">
                Country
              </label>
              <select
                value={filters.country}
                onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
              >
                <option value="all">All ({countries.length})</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium block mb-1">
                Keyword search
              </label>
              <input
                type="text"
                value={filters.keyword}
                onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
                placeholder="Tìm keyword..."
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="border rounded-xl bg-white py-16 text-center">
          <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <div className="text-sm font-medium text-slate-900">Chưa có alert nào</div>
          <div className="text-xs text-slate-500 mt-1">
            {rows.length === 0
              ? 'Tab AlertLog trống hoặc chưa được tạo. Chạy runRankAlerts trên Apps Script trước.'
              : 'Không match filter hiện tại — thử mở rộng khung thời gian.'}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, items]) => (
            <DayGroup key={day} day={day} items={items} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">
        {label}
      </div>
      <div className="text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{hint}</div>
    </div>
  );
}

function DayGroup({ day, items }: { day: string; items: AlertLogRow[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <header className="px-4 py-2.5 border-b bg-slate-50/60 flex items-center gap-2">
        <Calendar className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs font-semibold text-slate-700">
          {formatDateShort(items[0].snapshotDate)}
        </span>
        <span className="text-[11px] text-slate-500">
          ({items.length} alert{items.length === 1 ? '' : 's'})
        </span>
      </header>
      <div className="divide-y">
        {items.map((r, i) => (
          <AlertRow key={`${day}-${i}`} row={r} />
        ))}
      </div>
    </section>
  );
}

function AlertRow({ row }: { row: AlertLogRow }) {
  const deltaPos = row.deltaPos ?? 0;
  const severity = deltaPos >= 3 ? 'high' : deltaPos >= 2 ? 'med' : 'low';
  const accent =
    severity === 'high' ? 'bg-rose-500' : severity === 'med' ? 'bg-orange-400' : 'bg-amber-300';
  const badge =
    severity === 'high'
      ? 'bg-rose-100 text-rose-800'
      : severity === 'med'
        ? 'bg-orange-100 text-orange-800'
        : 'bg-amber-100 text-amber-800';

  return (
    <article className="relative px-4 py-2.5 hover:bg-slate-50/60 transition">
      <span className={cn('absolute left-0 top-0 bottom-0 w-1', accent)} aria-hidden />
      <div className="flex items-center gap-3 flex-wrap">
        <div className={cn('inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold tabular-nums', badge)}>
          +{deltaPos.toFixed(1)}
        </div>
        <KeywordLink keyword={row.keyword} country={row.country} className="font-semibold text-sm" />
        <span className="text-[11px] text-slate-500">
          {row.country} · {row.surface} · {row.window}
        </span>
        <span className="text-[12px] text-slate-700 font-mono ml-auto">
          {row.posP?.toFixed(1) ?? '—'} → {row.posL?.toFixed(1) ?? '—'}
        </span>
        <span className="text-[11px] text-slate-500 w-20 text-right tabular-nums">
          {formatNumber(row.usersL)} users
        </span>
        {row.topContribWindows && (
          <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
            top in {row.topContribWindows}
          </span>
        )}
      </div>
    </article>
  );
}
