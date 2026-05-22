'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyTrendPoint } from './aggregate';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface Props {
  data: DailyTrendPoint[];
  height?: number;
}

type Metric = 'users' | 'getApp' | 'cr';

const METRICS: { key: Metric; label: string; needHistoryDaily: boolean }[] = [
  { key: 'users', label: 'Users', needHistoryDaily: false },
  { key: 'getApp', label: 'GetApp', needHistoryDaily: true },
  { key: 'cr', label: 'CR', needHistoryDaily: true },
];

export function DailyTrendChart({ data, height = 220 }: Props) {
  const [metric, setMetric] = useState<Metric>('users');
  const hasGetApp = data.some((d) => d.getApp !== null);
  const hasCr = data.some((d) => d.cr !== null);

  const availability: Record<Metric, boolean> = {
    users: data.length > 0,
    getApp: hasGetApp,
    cr: hasCr,
  };

  if (data.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">Chưa có dữ liệu history.</div>
    );
  }

  // Filter points by metric availability so the area chart doesn't draw to 0.
  const chartData = data.filter((d) => {
    if (metric === 'users') return d.users > 0;
    if (metric === 'getApp') return d.getApp !== null;
    return d.cr !== null;
  });

  const yFmt = (v: number) => (metric === 'cr' ? formatPercent(v) : formatNumber(v, { compact: true }));
  const valueFmt = (v: number) => (metric === 'cr' ? formatPercent(v) : formatNumber(v));
  const labelOf = (m: Metric) => METRICS.find((x) => x.key === m)?.label ?? m;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
          {METRICS.map((m, idx) => {
            const enabled = availability[m.key];
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => enabled && setMetric(m.key)}
                disabled={!enabled}
                title={
                  enabled
                    ? ''
                    : m.needHistoryDaily
                    ? 'Cần History_Daily tab — chạy daily-snapshot.gs để bắt đầu thu thập.'
                    : ''
                }
                className={cn(
                  'px-2.5 py-1 font-medium transition',
                  idx > 0 && 'border-l border-slate-200',
                  metric === m.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50',
                  !enabled && 'opacity-40 cursor-not-allowed hover:bg-white',
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-slate-500">
          {chartData.length} ngày · {labelOf(metric)} per-day
        </span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 12, bottom: 4, left: -8 }}>
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 10, fill: '#64748b' }}
              stroke="#cbd5e1"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#64748b' }}
              stroke="#cbd5e1"
              tickLine={false}
              axisLine={false}
              tickFormatter={yFmt}
              width={52}
            />
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(value) => {
                const n = typeof value === 'number' ? value : Number(value);
                return [valueFmt(n), labelOf(metric)];
              }}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as DailyTrendPoint | undefined;
                return p?.date ?? String(label);
              }}
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke="#4f46e5"
              strokeWidth={2}
              fill="url(#trendGradient)"
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
