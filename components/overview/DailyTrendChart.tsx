'use client';

import { useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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
  lastNDays?: number;
  countryFilter?: string | null;
  keywordFilter?: string | null;
}

type Metric = 'users' | 'getApp' | 'cr';

const METRICS: { key: Metric; label: string; needHistoryDaily: boolean }[] = [
  { key: 'users', label: 'Users', needHistoryDaily: false },
  { key: 'getApp', label: 'Install', needHistoryDaily: true },
  { key: 'cr', label: 'CR', needHistoryDaily: true },
];

const RANGES = [7, 30, 90, 365] as const;

export function DailyTrendChart({
  data,
  height = 220,
  lastNDays,
  countryFilter,
  keywordFilter,
}: Props) {
  const [metric, setMetric] = useState<Metric>('users');
  const [rangeDays, setRangeDays] = useState<number>(
    lastNDays && (RANGES as readonly number[]).includes(lastNDays) ? lastNDays : 30,
  );
  // Trim by selected range: keep only the most recent N points.
  const trimmed = data.length > rangeDays ? data.slice(-rangeDays) : data;
  const hasGetApp = trimmed.some((d) => d.getApp !== null);
  const hasCr = trimmed.some((d) => d.cr !== null);

  const availability: Record<Metric, boolean> = {
    users: trimmed.length > 0,
    getApp: hasGetApp,
    cr: hasCr,
  };

  if (trimmed.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">Chưa có dữ liệu history.</div>
    );
  }

  // Filter points by metric availability so the area chart doesn't draw to 0.
  const chartData = trimmed.filter((d) => {
    if (metric === 'users') return d.users > 0;
    if (metric === 'getApp') return d.getApp !== null;
    return d.cr !== null;
  });

  // Faint linear-regression trend line over the visible points (least squares).
  const withTrend = (() => {
    const ys = chartData.map((d) => Number(d[metric]) || 0);
    const n = ys.length;
    if (n < 2) return chartData.map((d) => ({ ...d, trend: null as number | null }));
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    ys.forEach((y, i) => {
      sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i;
    });
    const denom = n * sumX2 - sumX * sumX;
    const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return chartData.map((d, i) => ({ ...d, trend: intercept + slope * i }));
  })();

  const yFmt = (v: number) => (metric === 'cr' ? formatPercent(v) : formatNumber(v, { compact: true }));
  const valueFmt = (v: number) => (metric === 'cr' ? formatPercent(v) : formatNumber(v));
  const labelOf = (m: Metric) => METRICS.find((x) => x.key === m)?.label ?? m;

  return (
    <div className="flex flex-col gap-2">
      {countryFilter && (
        <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
          Country filter (<b>{countryFilter}</b>) doesn&apos;t apply — History tab is global (no country breakdown).
        </div>
      )}
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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
            {RANGES.map((r, idx) => (
              <button
                key={r}
                type="button"
                onClick={() => setRangeDays(r)}
                className={cn(
                  'px-2.5 py-1 font-medium transition',
                  idx > 0 && 'border-l border-slate-200',
                  rangeDays === r
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {`L${r}`}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500">
            {chartData.length} ngày · {labelOf(metric)} per-day
            {keywordFilter ? ` · kw=${keywordFilter}` : ''}
          </span>
        </div>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={withTrend} margin={{ top: 10, right: 12, bottom: 4, left: -8 }}>
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
              formatter={(value, _name, item) => {
                if (item?.dataKey === 'trend') return null;
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
            <Line
              type="linear"
              dataKey="trend"
              stroke="#64748b"
              strokeWidth={1}
              strokeDasharray="4 4"
              strokeOpacity={0.45}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
