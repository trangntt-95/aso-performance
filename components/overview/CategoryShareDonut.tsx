'use client';

import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryShare } from './aggregate';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

const PALETTE: Record<string, string> = {
  Brand: '#7c3aed',
  Competitor: '#dc2626',
  Profit: '#059669',
  Feature: '#2563eb',
  Language: '#4338ca',
  Others: '#d97706',
  CPM: '#db2777',
  Noise: '#64748b',
  Unknown: '#94a3b8',
  CatePage: '#0891b2',
  Category: '#0891b2',
  Test: '#ca8a04',
};

interface Props {
  data: CategoryShare[];
  height?: number;
  activeCategory?: string | null;
  onCategoryClick?: (category: string) => void;
}

type Metric = 'users' | 'getApp' | 'cr';

const METRIC_LABEL: Record<Metric, string> = { users: 'Users', getApp: 'Install', cr: 'CR' };

export function CategoryShareDonut({ data, height = 260, activeCategory, onCategoryClick }: Props) {
  const [metric, setMetric] = useState<Metric>('users');
  const clickable = Boolean(onCategoryClick);
  const isCr = metric === 'cr';

  // Compute getApp share on the fly (CategoryShare carries getApp value but not its share %).
  const totalGetApp = useMemo(() => data.reduce((s, d) => s + d.getApp, 0), [data]);

  const enriched = useMemo(
    () =>
      data
        .filter((d) => (metric === 'getApp' ? d.getApp > 0 : d.users > 0))
        .map((d) => ({
          ...d,
          // For CR the slice size is the CR value itself (installs/users); share % is not meaningful.
          metricValue: metric === 'users' ? d.users : metric === 'getApp' ? d.getApp : d.cr,
          metricShare: metric === 'users' ? d.share : totalGetApp > 0 ? d.getApp / totalGetApp : 0,
        }))
        .sort((a, b) => b.metricValue - a.metricValue),
    [data, metric, totalGetApp],
  );

  return (
    <div className="flex flex-col gap-2" style={{ height }}>
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
          <button
            type="button"
            onClick={() => setMetric('users')}
            className={cn(
              'px-2.5 py-1 font-medium transition',
              metric === 'users' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            Users
          </button>
          <button
            type="button"
            onClick={() => setMetric('getApp')}
            className={cn(
              'px-2.5 py-1 font-medium transition border-l border-slate-200',
              metric === 'getApp' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            Install
          </button>
          <button
            type="button"
            onClick={() => setMetric('cr')}
            className={cn(
              'px-2.5 py-1 font-medium transition border-l border-slate-200',
              metric === 'cr' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            CR
          </button>
        </div>
        <span className="text-[10px] text-slate-500">
          {isCr ? 'CR (installs/users) theo category' : `Share theo ${METRIC_LABEL[metric]}`}
        </span>
      </div>
      <div className="flex-1 flex items-center min-h-0">
        <ResponsiveContainer width="55%" height="100%">
          <PieChart>
            <Pie
              data={enriched}
              dataKey="metricValue"
              nameKey="category"
              innerRadius="55%"
              outerRadius="90%"
              paddingAngle={1}
              stroke="#fff"
              strokeWidth={2}
              cursor={clickable ? 'pointer' : undefined}
              onClick={(payload) => {
                const c = (payload as unknown as { payload?: { category?: string } })?.payload?.category;
                if (c && onCategoryClick) onCategoryClick(c);
              }}
            >
              {enriched.map((d, i) => (
                <Cell
                  key={i}
                  fill={PALETTE[d.category] ?? '#94a3b8'}
                  opacity={activeCategory && activeCategory !== d.category ? 0.3 : 1}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(value, _name, item) => {
                const n = typeof value === 'number' ? value : Number(value);
                const payload = item?.payload as (CategoryShare & { metricShare?: number }) | undefined;
                const cat = payload?.category ?? '';
                if (isCr) return [`CR ${formatPercent(payload?.cr ?? 0)}`, cat];
                const share = payload?.metricShare ?? 0;
                return [`${formatNumber(n, { compact: true })} · ${formatPercent(share)}`, cat];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 grid grid-cols-1 gap-1 text-xs overflow-y-auto max-h-full pl-3">
          {enriched.map((d) => (
            <button
              key={d.category}
              type="button"
              onClick={() => onCategoryClick?.(d.category)}
              disabled={!clickable}
              className={cn(
                'flex items-center gap-2 text-left rounded px-1 py-0.5 transition',
                clickable && 'hover:bg-slate-100',
                activeCategory === d.category && 'bg-indigo-50 ring-1 ring-indigo-300',
                activeCategory && activeCategory !== d.category && 'opacity-50',
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PALETTE[d.category] ?? '#94a3b8' }} />
              <span className="text-slate-700 truncate flex-1">{d.category}</span>
              <span className="text-slate-500 font-mono tabular-nums">{formatPercent(isCr ? d.cr : d.metricShare)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
