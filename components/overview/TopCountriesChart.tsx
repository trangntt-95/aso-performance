'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CountryRollup } from './aggregate';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

const DELTA_KEY: Record<Metric, keyof CountryRollup> = {
  users: 'deltaUsersPct',
  getApp: 'deltaGetAppPct',
  cr: 'deltaCrPct',
};

function fmtDelta(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '';
  const p = v * 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
}
function deltaColor(v: number | null): string {
  if (v === null || v === 0 || !Number.isFinite(v)) return '#94a3b8';
  return v > 0 ? '#059669' : '#dc2626';
}

const PALETTE = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#eef2ff', '#f5f3ff'];

type Metric = 'users' | 'getApp' | 'cr';

const METRIC_LABEL: Record<Metric, string> = { users: 'Users', getApp: 'Install', cr: 'CR' };

interface Props {
  data: CountryRollup[];
  height?: number;
  onCountryClick?: (country: string) => void;
  activeCountry?: string | null;
}

function tickFmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function TopCountriesChart({ data, height = 280, onCountryClick, activeCountry }: Props) {
  const [metric, setMetric] = useState<Metric>('users');
  const clickable = Boolean(onCountryClick);
  const isCr = metric === 'cr';
  // Rank-numbered label so the order is obvious on the Y axis (1., 2., 3., …).
  const sortedData = [...data]
    .sort((a, b) => b[metric] - a[metric])
    .map((d, i) => ({ ...d, rankLabel: `${i + 1}. ${d.country}` }));
  const axisFmt = (n: number) => (isCr ? formatPercent(n) : tickFmt(n));
  const deltaKey = DELTA_KEY[metric];

  // % change vs last period, drawn just past the end of each bar.
  const renderDelta = (props: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    index?: number;
  }) => {
    const i = props.index ?? 0;
    const d = sortedData[i];
    const dv = (d?.[deltaKey] ?? null) as number | null;
    if (dv === null || !Number.isFinite(dv)) return null;
    const x = Number(props.x) + Number(props.width) + 6;
    const y = Number(props.y) + Number(props.height) / 2;
    return (
      <text x={x} y={y} dy={3.5} fontSize={10} fontWeight={600} fill={deltaColor(dv)} textAnchor="start">
        {fmtDelta(dv)}
      </text>
    );
  };

  return (
    <div className="flex flex-col gap-2" style={{ height }}>
      <div className="flex items-center justify-end shrink-0">
        <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
          <button
            type="button"
            onClick={() => setMetric('users')}
            className={cn(
              'px-2.5 py-0.5 font-medium transition',
              metric === 'users' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            Users
          </button>
          <button
            type="button"
            onClick={() => setMetric('getApp')}
            className={cn(
              'px-2.5 py-0.5 font-medium transition border-l border-slate-200',
              metric === 'getApp' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            Install
          </button>
          <button
            type="button"
            onClick={() => setMetric('cr')}
            className={cn(
              'px-2.5 py-0.5 font-medium transition border-l border-slate-200',
              metric === 'cr' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            CR
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sortedData} layout="vertical" margin={{ top: 8, right: 56, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: '#64748b' }}
              stroke="#cbd5e1"
              tickLine={false}
              axisLine={false}
              tickFormatter={axisFmt}
            />
            <YAxis
              type="category"
              dataKey="rankLabel"
              tick={{ fontSize: 11, fill: '#475569' }}
              stroke="#cbd5e1"
              tickLine={false}
              axisLine={false}
              width={172}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(v, _name, item) => {
                const n = typeof v === 'number' ? v : Number(v);
                const dv = (item?.payload?.[deltaKey] ?? null) as number | null;
                const base = isCr ? formatPercent(n) : formatNumber(n);
                const suffix = dv === null || !Number.isFinite(dv) ? '' : ` (${fmtDelta(dv)} vs kỳ trước)`;
                return [`${base}${suffix}`, METRIC_LABEL[metric]];
              }}
            />
            <Bar
              dataKey={metric}
              name={METRIC_LABEL[metric]}
              radius={[0, 6, 6, 0]}
              maxBarSize={20}
              cursor={clickable ? 'pointer' : undefined}
              onClick={(payload) => {
                const c = (payload as unknown as { payload?: { country?: string } })?.payload?.country;
                if (c && onCountryClick) onCountryClick(c);
              }}
            >
              {sortedData.map((d, i) => {
                const isActive = activeCountry === d.country;
                const dimmed = activeCountry && !isActive;
                return (
                  <Cell
                    key={i}
                    fill={PALETTE[i % PALETTE.length]}
                    fillOpacity={dimmed ? 0.35 : 1}
                    stroke={isActive ? '#0c4a6e' : 'none'}
                    strokeWidth={isActive ? 2 : 0}
                    style={{ transition: 'fill-opacity 120ms ease, stroke 120ms ease' }}
                  />
                );
              })}
              <LabelList dataKey={metric} content={renderDelta} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
