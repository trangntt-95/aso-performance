'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Globe2, Leaf, DollarSign } from 'lucide-react';
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
  country: string;
  keyword: string;
  category: string;
  organic: KeywordRow | null;
  paid: KeywordRow | null;
  topAlert: KeywordRow;
}

function groupByKeyword(rows: KeywordRow[]): GroupedRow[] {
  const map = new Map<string, GroupedRow>();
  rows.forEach((r) => {
    if (!r.country) return;
    const key = `${r.country}||${r.searchTerm}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        country: r.country,
        keyword: r.searchTerm,
        category: r.category,
        organic: null,
        paid: null,
        topAlert: r,
      });
    }
    const g = map.get(key)!;
    if (r.surface === 'search_ad') g.paid = r;
    else g.organic = r;
    if (alertSeverity(r.alert) > alertSeverity(g.topAlert.alert)) g.topAlert = r;
  });
  return Array.from(map.values());
}

const GRID_COLS =
  'grid grid-cols-[7rem_minmax(0,1fr)_8rem_8rem_minmax(11rem,16rem)] gap-2 items-center';

function HeaderRow() {
  return (
    <div
      className={cn(
        GRID_COLS,
        'hidden md:grid px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50 border-b',
      )}
    >
      <div>Country</div>
      <div>Keyword</div>
      <div className="flex items-center gap-1 text-emerald-700">
        <Leaf className="h-3 w-3" /> Organic
      </div>
      <div className="flex items-center gap-1 text-amber-700">
        <DollarSign className="h-3 w-3" /> Paid (Ads)
      </div>
      <div>Vấn đề</div>
    </div>
  );
}

function ChannelCell({ row, tone }: { row: KeywordRow | null; tone: 'organic' | 'paid' }) {
  if (!row) {
    return (
      <div className="text-[11px] text-slate-400">
        — <span className="text-slate-300">không có</span>
      </div>
    );
  }
  const dTone = deltaTone(row.deltaUsersPct);
  return (
    <div className="space-y-0.5 text-[12px] leading-tight">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10px] text-slate-500">Pos</span>
        <span className="font-mono font-semibold tabular-nums">{formatPos(row.posL)}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10px] text-slate-500">Users</span>
        <span className="font-mono tabular-nums">{formatNumber(row.usersL, { compact: true })}</span>
        <span
          className={cn(
            'font-medium text-[11px]',
            dTone === 'pos' ? 'text-emerald-700' : dTone === 'neg' ? 'text-rose-700' : 'text-slate-500',
          )}
        >
          {formatDeltaPct(row.deltaUsersPct)}
        </span>
      </div>
      {row.alert && row.alert !== 'OK' && alertSeverity(row.alert) > 0 && (
        <div
          className={cn(
            'text-[10px] truncate',
            tone === 'organic' ? 'text-emerald-700' : 'text-amber-700',
          )}
          title={row.alert}
        >
          {alertCopy(row.alert)}
        </div>
      )}
    </div>
  );
}

function DesktopRow({ g }: { g: GroupedRow }) {
  return (
    <div className={cn(GRID_COLS, 'hidden md:grid px-3 py-2.5 text-sm hover:bg-slate-50/60 items-start')}>
      <div className="pt-0.5">
        <span className="font-mono text-[11px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded inline-flex items-center w-fit">
          {g.country}
        </span>
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="flex items-center gap-1.5 mb-0.5">
          <CategoryChip category={g.category} compact />
          <KeywordLink
            keyword={g.keyword}
            country={g.country}
            className="font-medium text-sm truncate"
          />
        </div>
      </div>
      <ChannelCell row={g.organic} tone="organic" />
      <ChannelCell row={g.paid} tone="paid" />
      <div className="space-y-0.5">
        <AlertBadge alert={g.topAlert.alert} compact />
        <div className="text-[10px] text-slate-500 line-clamp-2">{alertCopy(g.topAlert.alert)}</div>
        <div className="text-[10px] text-slate-400">
          {g.organic && g.paid
            ? 'cả 2 channel'
            : g.organic
              ? 'chỉ organic'
              : g.paid
                ? 'chỉ paid'
                : ''}
        </div>
      </div>
    </div>
  );
}

function MobileRow({ g }: { g: GroupedRow }) {
  return (
    <div className="md:hidden px-3 py-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
          {g.country}
        </span>
        <CategoryChip category={g.category} compact />
        <KeywordLink
          keyword={g.keyword}
          country={g.country}
          className="font-medium text-sm flex-1 min-w-0 truncate"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div className="border rounded p-2">
          <div className="text-[10px] text-emerald-700 uppercase tracking-wider mb-0.5 flex items-center gap-1">
            <Leaf className="h-3 w-3" /> Organic
          </div>
          <ChannelCell row={g.organic} tone="organic" />
        </div>
        <div className="border rounded p-2">
          <div className="text-[10px] text-amber-700 uppercase tracking-wider mb-0.5 flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> Paid
          </div>
          <ChannelCell row={g.paid} tone="paid" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <AlertBadge alert={g.topAlert.alert} compact />
        <span className="text-[10px] text-slate-500 truncate">{alertCopy(g.topAlert.alert)}</span>
      </div>
    </div>
  );
}

interface SectionProps {
  window: Window;
  rows: KeywordRow[];
  open: boolean;
  onToggle: () => void;
  filter: string;
}

function WindowSection({ window: w, rows, open, onToggle, filter }: SectionProps) {
  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = groupByKeyword(rows);
    return all
      .filter((g) => hasInterestingAlert(g.topAlert.alert))
      .filter((g) => {
        if (!q) return true;
        return `${g.keyword} ${g.country} ${g.category}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const sa = alertSeverity(a.topAlert.alert);
        const sb = alertSeverity(b.topAlert.alert);
        if (sa !== sb) return sb - sa;
        const ua = Math.max(a.organic?.usersL ?? 0, a.paid?.usersL ?? 0);
        const ub = Math.max(b.organic?.usersL ?? 0, b.paid?.usersL ?? 0);
        return ub - ua;
      });
  }, [rows, filter]);

  const negativeCount = grouped.filter((g) => alertSeverity(g.topAlert.alert) >= 1).length;
  const oppCount = grouped.filter((g) => g.topAlert.alert.startsWith('🎯')).length;
  const dualCount = grouped.filter((g) => g.organic && g.paid).length;

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
        <span className="font-mono text-xs text-slate-600 w-8">{w}</span>
        <span className="text-sm font-medium">Last {w.slice(1)} days</span>
        <span className="text-xs text-slate-500 ml-2">
          {grouped.length} keyword{grouped.length === 1 ? '' : 's'} (in {dualCount} cả 2 channel)
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {negativeCount > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-rose-100 text-rose-900 font-semibold">
              {negativeCount} negative
            </span>
          )}
          {oppCount > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-900 font-semibold">
              🎯 {oppCount}
            </span>
          )}
        </div>
      </button>
      {open && (
        <div className="border-t">
          {grouped.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              No notable alerts in this window.
            </div>
          ) : (
            <>
              <HeaderRow />
              <div className="divide-y">
                {grouped.map((g) => (
                  <div key={g.key}>
                    <DesktopRow g={g} />
                    <MobileRow g={g} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Tier1WatchView() {
  const { data, isLoading, error } = useSheetData();
  const [openWindows, setOpenWindows] = useState<Record<Window, boolean>>({
    L3: true,
    L7: true,
    L14: false,
    L30: false,
    L90: false,
    L365: false,
    'L90+L30': false,
  });
  const [filter, setFilter] = useState('');

  const tabsByWindow = useMemo<Record<Window, KeywordRow[]>>(
    () => ({
      L3: (data?.countryL3 ?? []).filter((r) => r.country && TIER1_COUNTRIES.has(r.country)),
      L7: (data?.countryL7 ?? []).filter((r) => r.country && TIER1_COUNTRIES.has(r.country)),
      L14: (data?.countryL14 ?? []).filter((r) => r.country && TIER1_COUNTRIES.has(r.country)),
      L30: (data?.countryL30 ?? []).filter((r) => r.country && TIER1_COUNTRIES.has(r.country)),
      L90: [],
      L365: [],
      'L90+L30': [],
    }),
    [data],
  );

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
      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded p-3 text-xs text-emerald-900">
        <Globe2 className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          Keyword alerts ở các thị trường doanh thu cao <b>United States · United Kingdom · Canada · Australia</b>.
          Mỗi row gộp organic + paid của cùng keyword × country để dễ so sánh pos giữa 2 channel. Window ngắn
          surface vấn đề mới, window dài confirm trend.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter keyword, country, category…"
          className="h-8 max-w-sm"
        />
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {WINDOWS.map((w) => (
            <Skeleton key={w} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {WINDOWS.map((w) => (
            <WindowSection
              key={w}
              window={w}
              rows={tabsByWindow[w]}
              open={openWindows[w]}
              onToggle={() => setOpenWindows((s) => ({ ...s, [w]: !s[w] }))}
              filter={filter}
            />
          ))}
        </div>
      )}
    </div>
  );
}
