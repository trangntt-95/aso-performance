'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Globe2, Leaf, DollarSign, AlertTriangle, Zap } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import type { KeywordRow, Window } from '@/lib/sheets/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { AlertBadge } from '@/components/action-queue/AlertBadge';
import { CategoryChip } from '@/components/shared/CategoryChip';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { alertCopy } from '@/lib/utils/copy';
import { formatDeltaPct, formatNumber, formatPos, deltaTone } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

const TIER1_COUNTRIES = new Set([
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'US',
  'UK',
  'CA',
  'AU',
]);
const WINDOWS: Window[] = ['L3', 'L7', 'L14', 'L30'];

function alertSeverity(alert: string): number {
  if (alert.startsWith('🚨')) return 5;
  if (alert.startsWith('⚠️')) return 4;
  if (alert.startsWith('💔')) return 3;
  if (alert.startsWith('💸')) return 2;
  if (alert.startsWith('📉')) return 1;
  if (alert.startsWith('🎯')) return 0.5;
  return 0;
}

function hasInterestingAlert(alert: string): boolean {
  if (!alert || alert === 'OK') return false;
  return alertSeverity(alert) > 0 || alert.startsWith('🎯');
}

interface GroupedRow {
  key: string;
  window: Window;
  country: string;
  keyword: string;
  category: string;
  organic: KeywordRow | null;
  paid: KeywordRow | null;
  topAlert: KeywordRow;
  maxSeverity: number;
  maxUsers: number;
}

function groupByKeyword(rows: KeywordRow[], window: Window): GroupedRow[] {
  const map = new Map<string, GroupedRow>();
  rows.forEach((r) => {
    if (!r.country) return;
    const key = `${r.country}||${r.searchTerm}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        window,
        country: r.country,
        keyword: r.searchTerm,
        category: r.category,
        organic: null,
        paid: null,
        topAlert: r,
        maxSeverity: 0,
        maxUsers: 0,
      });
    }
    const g = map.get(key)!;
    if (r.surface === 'search_ad') g.paid = r;
    else g.organic = r;
    if (alertSeverity(r.alert) > alertSeverity(g.topAlert.alert)) g.topAlert = r;
    g.maxSeverity = Math.max(g.maxSeverity, alertSeverity(r.alert));
    g.maxUsers = Math.max(g.maxUsers, r.usersL);
  });
  return Array.from(map.values()).filter((g) => hasInterestingAlert(g.topAlert.alert));
}

function ChannelMini({ row }: { row: KeywordRow | null; tone?: 'organic' | 'paid' }) {
  if (!row) {
    return <span className="text-[11px] text-slate-300">—</span>;
  }
  const userDTone = deltaTone(row.deltaUsersPct);
  const userToneCls =
    userDTone === 'pos' ? 'text-emerald-700' : userDTone === 'neg' ? 'text-rose-700' : 'text-slate-700';
  // Position: lower = better, so improving (posL < posP) is positive.
  let posToneCls = 'text-slate-700';
  if (row.posL !== null && row.posP !== null) {
    const diff = row.posL - row.posP;
    if (Math.abs(diff) >= 0.5) {
      posToneCls = diff < 0 ? 'text-emerald-700' : 'text-rose-700';
    }
  }
  return (
    <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
      {row.posP !== null && row.posL !== null && (
        <span className="font-mono text-[10px]" title="Position (lower = better)">
          P<span className="text-slate-500">{formatPos(row.posP)}</span>
          <span className="text-slate-400 mx-0.5">→</span>
          <span className={cn('font-medium', posToneCls)}>{formatPos(row.posL)}</span>
        </span>
      )}
      <span className="font-mono">
        <span className="text-slate-500">{formatNumber(row.usersP, { compact: true })}</span>
        <span className="text-slate-400 mx-0.5">→</span>
        <span className={cn('font-medium', userToneCls)}>{formatNumber(row.usersL, { compact: true })}</span>
        <span className="text-slate-400 ml-0.5">u</span>
      </span>
      <span className={cn('font-medium', userToneCls)}>{formatDeltaPct(row.deltaUsersPct)}</span>
    </div>
  );
}

const GRID = 'grid grid-cols-[3.5rem_6rem_minmax(0,1fr)_minmax(11rem,14rem)_minmax(11rem,14rem)_minmax(8rem,11rem)] gap-2 items-center';

function Tier1WatchInner({
  rows,
  filter,
  selectedWindow,
}: {
  rows: GroupedRow[];
  filter: string;
  selectedWindow: Window | 'ALL';
}) {
  const q = filter.trim().toLowerCase();
  const filtered = rows
    .filter((g) => (selectedWindow === 'ALL' ? true : g.window === selectedWindow))
    .filter((g) =>
      q ? `${g.keyword} ${g.country} ${g.category}`.toLowerCase().includes(q) : true,
    )
    .sort((a, b) => {
      if (a.maxSeverity !== b.maxSeverity) return b.maxSeverity - a.maxSeverity;
      return b.maxUsers - a.maxUsers;
    });

  if (filtered.length === 0) {
    return (
      <div className="border rounded-lg bg-white py-8 text-center text-sm text-slate-500">
        Không có alert phù hợp.
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className={cn(GRID, 'px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50 border-b hidden md:grid')}>
        <div>Window</div>
        <div>Country</div>
        <div>Keyword</div>
        <div className="flex items-center gap-1 text-emerald-700"><Leaf className="h-3 w-3" /> Organic</div>
        <div className="flex items-center gap-1 text-amber-700"><DollarSign className="h-3 w-3" /> Paid</div>
        <div>Alert</div>
      </div>
      <div className="divide-y">
        {filtered.map((g) => (
          <div key={`${g.window}-${g.key}`}>
            <div className={cn(GRID, 'hidden md:grid px-3 py-2 text-sm hover:bg-slate-50/60')}>
              <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded inline-block w-fit">
                {g.window}
              </span>
              <span className="font-mono text-[11px] text-slate-700 truncate">{g.country}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <CategoryChip category={g.category} compact />
                <KeywordLink keyword={g.keyword} country={g.country} className="font-medium text-[13px] truncate" />
              </div>
              <ChannelMini row={g.organic} tone="organic" />
              <ChannelMini row={g.paid} tone="paid" />
              <div className="min-w-0">
                <AlertBadge alert={g.topAlert.alert} compact />
                <div className="text-[10px] text-slate-500 truncate" title={alertCopy(g.topAlert.alert)}>
                  {alertCopy(g.topAlert.alert)}
                </div>
              </div>
            </div>
            {/* Mobile */}
            <div className="md:hidden px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{g.window}</span>
                <span className="font-mono text-[10px] text-slate-700">{g.country}</span>
                <CategoryChip category={g.category} compact />
                <KeywordLink keyword={g.keyword} country={g.country} className="font-medium text-[13px] flex-1 truncate" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="border rounded p-1.5">
                  <div className="text-[9px] text-emerald-700 uppercase mb-0.5">Organic</div>
                  <ChannelMini row={g.organic} tone="organic" />
                </div>
                <div className="border rounded p-1.5">
                  <div className="text-[9px] text-amber-700 uppercase mb-0.5">Paid</div>
                  <ChannelMini row={g.paid} tone="paid" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertBadge alert={g.topAlert.alert} compact />
                <span className="text-[11px] text-slate-500 truncate">{alertCopy(g.topAlert.alert)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SummaryStat {
  label: string;
  value: number;
  tone: 'critical' | 'warn' | 'opp' | 'neutral';
  Icon: typeof AlertTriangle;
}

function SummaryTile({ label, value, tone, Icon }: SummaryStat) {
  const toneCls = {
    critical: 'border-rose-200 bg-rose-50 text-rose-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    opp: 'border-blue-200 bg-blue-50 text-blue-800',
    neutral: 'border-slate-200 bg-white text-slate-700',
  }[tone];
  return (
    <div className={cn('border rounded-lg px-3 py-2 flex items-center gap-2', toneCls)}>
      <Icon className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
        <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      </div>
    </div>
  );
}

export function Tier1WatchView() {
  const { data, isLoading, error } = useSheetData();
  const [filter, setFilter] = useState('');
  const [selectedWindow, setSelectedWindow] = useState<Window | 'ALL'>('L7');

  const groupedAll = useMemo<GroupedRow[]>(() => {
    if (!data) return [];
    const out: GroupedRow[] = [];
    const sources: Array<{ w: Window; rows: KeywordRow[] }> = [
      { w: 'L3', rows: data.countryL3 ?? [] },
      { w: 'L7', rows: data.countryL7 ?? [] },
      { w: 'L14', rows: data.countryL14 ?? [] },
      { w: 'L30', rows: data.countryL30 ?? [] },
    ];
    for (const { w, rows } of sources) {
      const tier1Rows = rows.filter((r) => r.country && TIER1_COUNTRIES.has(r.country));
      out.push(...groupByKeyword(tier1Rows, w));
    }
    return out;
  }, [data]);

  // Summary across ALL windows (independent of selected window)
  const summary = useMemo(() => {
    let critical = 0;
    let warn = 0;
    let opp = 0;
    const markets = new Set<string>();
    for (const g of groupedAll) {
      if (g.maxSeverity >= 4) critical += 1;
      else if (g.maxSeverity >= 1) warn += 1;
      if (g.topAlert.alert.startsWith('🎯')) opp += 1;
      markets.add(g.country);
    }
    return { critical, warn, opp, markets: markets.size, total: groupedAll.length };
  }, [groupedAll]);

  const countsByWindow = useMemo(() => {
    const counts: Record<Window | 'ALL', number> = { L3: 0, L7: 0, L14: 0, L30: 0, L90: 0, L365: 0, 'L90+L30': 0, ALL: groupedAll.length };
    for (const g of groupedAll) counts[g.window] += 1;
    return counts;
  }, [groupedAll]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
        <div className="font-semibold">Couldn’t load Tier 1 data</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded p-2.5 text-xs text-emerald-900">
        <Globe2 className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          Alerts ở <b>US · UK · CA · AU</b> — keyword × country gộp 2 channel. Pick window để focus, hoặc xem all.
        </div>
      </div>

      {/* Summary tiles */}
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <SummaryTile label="Critical (🚨 ⚠️)" value={summary.critical} tone="critical" Icon={AlertTriangle} />
          <SummaryTile label="Warning (📉 💸 💔)" value={summary.warn} tone="warn" Icon={AlertCircle} />
          <SummaryTile label="Opportunity (🎯)" value={summary.opp} tone="opp" Icon={Zap} />
          <SummaryTile label="Markets affected" value={summary.markets} tone="neutral" Icon={Globe2} />
        </div>
      )}

      {/* Window tabs + filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
          {(['ALL', 'L3', 'L7', 'L14', 'L30'] as const).map((w, idx) => (
            <button
              key={w}
              type="button"
              onClick={() => setSelectedWindow(w)}
              className={cn(
                'px-2.5 py-1 font-medium transition',
                idx > 0 && 'border-l border-slate-200',
                selectedWindow === w
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {w}
              <span className={cn('ml-1 text-[10px]', selectedWindow === w ? 'text-slate-300' : 'text-slate-400')}>
                {countsByWindow[w] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter keyword / country / category…"
          className="h-7 max-w-xs text-sm"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {WINDOWS.map((w) => (
            <Skeleton key={w} className="h-16" />
          ))}
        </div>
      ) : (
        <Tier1WatchInner rows={groupedAll} filter={filter} selectedWindow={selectedWindow} />
      )}
    </div>
  );
}
