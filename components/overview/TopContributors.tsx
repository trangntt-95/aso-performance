'use client';

import { Users, Target } from 'lucide-react';
import type { ContributorRow } from './aggregate';
import { CategoryChip } from '@/components/shared/CategoryChip';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface ColumnProps {
  title: string;
  unitLabel: string;
  Icon: typeof Users;
  rows: ContributorRow[];
  accent: 'indigo' | 'emerald';
}

function Column({ title, unitLabel, Icon, rows, accent }: ColumnProps) {
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

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className={cn('flex items-center gap-2 px-3 py-2 border-b bg-slate-50/60', headerColor)}>
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-[10px] text-slate-500 ml-auto">{unitLabel}</span>
      </div>
      <ol className="divide-y">
        {rows.map((r, i) => (
          <li key={`${r.keyword}-${i}`} className="px-3 py-2.5 hover:bg-slate-50/60 transition">
            <div className="flex items-start gap-3">
              <span className="text-[11px] font-mono font-semibold text-slate-400 w-5 shrink-0 mt-0.5">
                {(i + 1).toString().padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <KeywordLink keyword={r.keyword} className="font-semibold text-sm" />
                  <CategoryChip category={r.category} compact />
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
        ))}
      </ol>
    </div>
  );
}

interface Props {
  users: ContributorRow[];
  getApp: ContributorRow[];
}

export function TopContributors({ users, getApp }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Column title="Top Users" unitLabel="users · share %" Icon={Users} rows={users} accent="indigo" />
      <Column
        title="Top GetApp"
        unitLabel="installs · share %"
        Icon={Target}
        rows={getApp}
        accent="emerald"
      />
    </div>
  );
}
