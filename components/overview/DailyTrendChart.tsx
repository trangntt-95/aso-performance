'use client';

import { useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
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
  /** Pinned date range (date mode). from === to means a single day. */
  selectedFrom?: string | null;
  selectedTo?: string | null;
  /** Click a day to pin/unpin it → scopes the whole page to that single date. */
  onDateSelect?: (iso: string | null) => void;
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
  selectedFrom,
  selectedTo,
  onDateSelect,
}: Props) {
  const [metric, setMetric] = useState<Metric>('users');
  const [rangeDays, setRangeDays] = useState<number>(
    lastNDays && (RANGES as readonly number[]).includes(lastNDays) ? lastNDays : 30,
  );
  // When a date RANGE is pinned (date mode From→To), scope the chart to exactly
  // that range. Otherwise keep the most recent N points (the L7/L30/... toggle).
  const isRangeScope = !!selectedFrom && !!selectedTo && selectedFrom !== selectedTo;
  const trimmed = isRangeScope
    ? data.filter((d) => d.date >= (selectedFrom as string) && d.date <= (selectedTo as string))
    : data.length > rangeDays
    ? data.slice(-rangeDays)
    : data;
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

  // Pinned-range marker: map ISO from/to → x-axis labels (if in view).
  const isRange = !!selectedFrom && !!selectedTo && selectedFrom !== selectedTo;
  const fromLabel = selectedFrom
    ? withTrend.find((d) => d.date === selectedFrom)?.dateLabel ?? null
    : null;
  const toLabel = selectedTo
    ? withTrend.find((d) => d.date === selectedTo)?.dateLabel ?? null
    : null;
  const anyPinned = !!selectedFrom || !!selectedTo;
  const pinnedOutOfRange = anyPinned && !fromLabel && !toLabel;
  const pinnedLabel = isRange
    ? `${selectedFrom} → ${selectedTo}`
    : selectedFrom ?? selectedTo ?? '';

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
          {isRangeScope ? (
            <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-100 rounded px-2 py-0.5 font-medium">
              Theo khoảng đã lọc · bỏ lọc ngày để dùng lại L7/L30/L90/L365
            </span>
          ) : (
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
          )}
          <span className="text-[10px] text-slate-500">
            {chartData.length} ngày · {labelOf(metric)} (rolling 7 ngày)
            {keywordFilter ? ` · kw=${keywordFilter}` : ''}
          </span>
        </div>
      </div>
      {onDateSelect && anyPinned && (
        <div className="flex items-center gap-2 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded bg-rose-100 text-rose-800 px-2 py-0.5 font-medium">
            📅 {isRange ? 'Đang lọc khoảng' : 'Đang ghim ngày'} {pinnedLabel}
            {pinnedOutOfRange && ' (ngoài range đang xem)'}
          </span>
          <button
            type="button"
            onClick={() => onDateSelect(null)}
            className="text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            Bỏ ghim ✕
          </button>
        </div>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={withTrend}
            margin={{ top: 10, right: 12, bottom: 4, left: -8 }}
            onClick={
              onDateSelect
                ? (state) => {
                    const p = (state as { activePayload?: { payload?: DailyTrendPoint }[] })
                      ?.activePayload?.[0]?.payload;
                    if (!p?.date) return;
                    const single = selectedFrom && selectedFrom === selectedTo ? selectedFrom : null;
                    onDateSelect(p.date === single ? null : p.date);
                  }
                : undefined
            }
            style={onDateSelect ? { cursor: 'pointer' } : undefined}
          >
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
            {isRange && fromLabel && toLabel ? (
              <ReferenceArea
                x1={fromLabel}
                x2={toLabel}
                fill="#e11d48"
                fillOpacity={0.08}
                stroke="#e11d48"
                strokeOpacity={0.3}
                ifOverflow="extendDomain"
              />
            ) : (
              (fromLabel || toLabel) && (
                <ReferenceLine
                  x={(fromLabel ?? toLabel) as string}
                  stroke="#e11d48"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  ifOverflow="extendDomain"
                />
              )
            )}
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
