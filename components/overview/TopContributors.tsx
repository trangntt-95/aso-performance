'use client';

import { useState } from 'react';
import { Users, Target, Search } from 'lucide-react';
import type { ContributorRow } from './aggregate';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { formatDeltaPct, formatNumber, deltaTone } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface ColumnProps {
  title: string;
  unitLabel: string;
  Icon: typeof Users;
  rows: ContributorRow[];
  total: number;
  accent: 'indigo' | 'emerald';
  activeKeyword?: string | null;
  activeSurface?: 'all' | 'organic' | 'paid';
  activeCountry?: string | null;
  onRowClick?: (keyword: string) => void;
  onKeywordSelect?: (keyword: string) => void;
}

function Column({ title, unitLabel, Icon, rows, total, accent, activeKeyword, activeSurface, activeCountry, onRowClick, onKeywordSelect }: ColumnProps) {
  const headerColor = accent === 'indigo' ? 'text-indigo-700' : 'text-emerald-700';
  const barColor = accent === 'indigo' ? 'bg-indigo-500' : 'bg-emerald-500';
  const barBg = accent === 'indigo' ? 'bg-indigo-100' : 'bg-emerald-100';

  if (rows.length === 0) {
    return (
      <div className="border rounded-lg bg-white p-4 text-center text-xs text-slate-500">
        Không có dữ liệu.
      </div>
    );
  }

  const shownSum = rows.reduce((s, r) => s + r.value, 0);
  const shownSharePct = total > 0 ? (shownSum / total) * 100 : 0;
  return (
    <div className="border rounded-lg overflow-hidden bg-white flex flex-col">
      <div className={cn('flex items-center gap-2 px-3 py-2 border-b bg-slate-50/60 shrink-0', headerColor)}>
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-[10px] text-slate-500 ml-auto">
          {rows.length} kw · {unitLabel}
        </span>
      </div>
      <div className={cn('flex items-center justify-between gap-2 px-3 py-2 border-b text-xs bg-white shrink-0', headerColor)}>
        <span className="font-semibold uppercase tracking-wider text-[10px]">Total</span>
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="font-mono font-bold text-sm text-slate-900">{formatNumber(total)}</span>
          <span className="text-[10px] text-slate-500 font-normal">
            top {rows.length}: {formatNumber(shownSum)} · {shownSharePct.toFixed(1)}%
          </span>
        </div>
      </div>
      <ol className="divide-y max-h-[420px] overflow-y-auto">
        {rows.map((r, i) => {
          const isActive = activeKeyword?.toLowerCase() === r.keyword.toLowerCase();
          return (
          <li
            key={`${r.keyword}-${i}`}
            onClick={() => onRowClick && onRowClick(r.keyword)}
            className={cn(
              'px-3 py-2.5 transition',
              onRowClick && 'cursor-pointer',
              isActive ? 'bg-violet-50 ring-1 ring-violet-300' : 'hover:bg-slate-50/60',
            )}
            title={onRowClick ? 'Click to filter page by this keyword' : undefined}
          >
            <div className="flex items-start gap-3">
              <span className="text-[11px] font-mono font-semibold text-slate-400 w-5 shrink-0 mt-0.5">
                {(i + 1).toString().padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <KeywordLink
                    keyword={r.keyword}
                    country={activeCountry ?? undefined}
                    surface={activeSurface ?? 'all'}
                    onSelect={onKeywordSelect}
                    className="font-semibold text-sm"
                  />
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                      r.surface === 'paid'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-emerald-100 text-emerald-700',
                    )}
                  >
                    {r.surface}
                  </span>
                  {r.deltaPct !== null && (
                    <span
                      className={cn(
                        'text-[10px] font-mono font-medium tabular-nums',
                        deltaTone(r.deltaPct) === 'pos'
                          ? 'text-emerald-700'
                          : deltaTone(r.deltaPct) === 'neg'
                          ? 'text-rose-700'
                          : 'text-slate-500',
                      )}
                      title={`Prior: ${formatNumber(r.prior)}`}
                    >
                      {formatDeltaPct(r.deltaPct)}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                    {formatNumber(r.value)}
                  </span>
                  <div className={cn('flex-1 h-1.5 rounded-full overflow-hidden', barBg)}>
                    <div
                      className={cn('h-full', barColor)}
                      style={{ width: `${Math.min(100, r.sharePct)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-slate-600 tabular-nums w-10 text-right">
                    {r.sharePct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </li>
          );
        })}
      </ol>
    </div>
  );
}

interface Props {
  users: ContributorRow[];
  getApp: ContributorRow[];
  totalUsers: number;
  totalGetApp: number;
  activeKeyword?: string | null;
  activeSurface?: 'all' | 'organic' | 'paid';
  activeCountry?: string | null;
  onRowClick?: (keyword: string) => void;
  onKeywordSelect?: (keyword: string) => void;
}

export function TopContributors({
  users,
  getApp,
  totalUsers,
  totalGetApp,
  activeKeyword,
  activeSurface,
  activeCountry,
  onRowClick,
  onKeywordSelect,
}: Props) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const matchRows = (rows: ContributorRow[]) =>
    query ? rows.filter((r) => r.keyword.toLowerCase().includes(query)) : rows;
  const fUsers = matchRows(users);
  const fGetApp = matchRows(getApp);

  return (
    <div className="space-y-2">
      <div className="relative max-w-xs">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm keyword trong bảng…"
          className="w-full rounded-md border border-slate-200 pl-7 pr-7 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            title="Xóa tìm kiếm"
          >
            ✕
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Column
        title="Top Users"
        unitLabel="users · share %"
        Icon={Users}
        rows={fUsers}
        total={totalUsers}
        accent="indigo"
        activeKeyword={activeKeyword}
        activeSurface={activeSurface}
        activeCountry={activeCountry}
        onRowClick={onRowClick}
        onKeywordSelect={onKeywordSelect}
      />
      <Column
        title="Top Install"
        unitLabel="installs · share %"
        Icon={Target}
        rows={fGetApp}
        total={totalGetApp}
        accent="emerald"
        activeKeyword={activeKeyword}
        activeSurface={activeSurface}
        activeCountry={activeCountry}
        onRowClick={onRowClick}
        onKeywordSelect={onKeywordSelect}
      />
      </div>
    </div>
  );
}
