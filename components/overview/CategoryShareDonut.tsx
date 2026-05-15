'use client';

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
  onCategoryClick?: (category: string) => void;
}

export function CategoryShareDonut({ data, height = 260, onCategoryClick }: Props) {
  const filtered = data.filter((d) => d.users > 0);
  const clickable = Boolean(onCategoryClick);
  return (
    <div style={{ height }} className="flex items-center">
      <ResponsiveContainer width="55%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="users"
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
            {filtered.map((d, i) => (
              <Cell key={i} fill={PALETTE[d.category] ?? '#94a3b8'} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(value, _name, item) => {
              const n = typeof value === 'number' ? value : Number(value);
              const cat = (item?.payload as CategoryShare | undefined)?.category ?? '';
              const share = (item?.payload as CategoryShare | undefined)?.share ?? 0;
              return [`${formatNumber(n, { compact: true })} · ${formatPercent(share)}`, cat];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 grid grid-cols-1 gap-1 text-xs overflow-y-auto max-h-full pl-3">
        {filtered.map((d) => (
          <button
            key={d.category}
            type="button"
            onClick={() => onCategoryClick?.(d.category)}
            disabled={!clickable}
            className={cn(
              'flex items-center gap-2 text-left rounded px-1 py-0.5',
              clickable && 'hover:bg-slate-100',
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PALETTE[d.category] ?? '#94a3b8' }} />
            <span className="text-slate-700 truncate flex-1">{d.category}</span>
            <span className="text-slate-500 font-mono tabular-nums">{formatPercent(d.share)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
