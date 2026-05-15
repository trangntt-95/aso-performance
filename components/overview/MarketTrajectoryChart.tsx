'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import type { MarketTrajectoryPoint } from './aggregate';
import { composeVerdict } from '@/lib/utils/format';

interface Props {
  data: MarketTrajectoryPoint[];
  metric: 'usersDelta' | 'getAppDelta' | 'weightedDelta';
  height?: number;
}

const COLOR_POS = '#059669';
const COLOR_NEG = '#e11d48';
const COLOR_FLAT = '#94a3b8';

function colorFor(v: number): string {
  if (v > 0.5) return COLOR_POS;
  if (v < -0.5) return COLOR_NEG;
  return COLOR_FLAT;
}

function tickFmt(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(0)}%`;
}

function fmtPct(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function toneCls(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return 'text-slate-500';
  if (n > 0.5) return 'text-emerald-700';
  if (n < -0.5) return 'text-rose-700';
  return 'text-slate-500';
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: MarketTrajectoryPoint }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const v = composeVerdict(p.weightedDelta / 100, p.usersDelta / 100);
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-md p-3 text-xs min-w-[220px]">
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-semibold text-slate-900">{label}</div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          {String(label).slice(1)}d window
        </span>
      </div>
      <dl className="space-y-1.5">
        <div className="flex justify-between items-baseline">
          <dt className="text-slate-500">Δ Users (total)</dt>
          <dd className={`font-medium tabular-nums ${toneCls(p.usersDelta)}`}>{fmtPct(p.usersDelta)}</dd>
        </div>
        <div className="flex justify-between items-baseline">
          <dt className="text-slate-500">Δ GetApp</dt>
          <dd className={`font-medium tabular-nums ${toneCls(p.getAppDelta)}`}>{fmtPct(p.getAppDelta)}</dd>
        </div>
        <div className="flex justify-between items-baseline">
          <dt className="text-slate-500">Δ Weighted (core)</dt>
          <dd className={`font-medium tabular-nums ${toneCls(p.weightedDelta)}`}>{fmtPct(p.weightedDelta)}</dd>
        </div>
        <div className="border-t border-slate-100 pt-1.5 mt-1.5">
          <dt className="text-slate-500 mb-0.5">Verdict</dt>
          <dd className="font-semibold text-slate-900 text-[11px]">{v.label}</dd>
        </div>
      </dl>
      <div className="text-[10px] text-slate-400 mt-2 leading-snug">
        Core = position-weighted basket (high-priority kw). Total = raw user count.
      </div>
    </div>
  );
}

export function MarketTrajectoryChart({ data, metric, height = 220 }: Props) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="window"
            tick={{ fontSize: 11, fill: '#64748b' }}
            stroke="#cbd5e1"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            stroke="#cbd5e1"
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFmt}
          />
          <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} content={<CustomTooltip />} />
          <Bar dataKey={metric} radius={[6, 6, 0, 0]} maxBarSize={42}>
            {data.map((d, i) => (
              <Cell key={i} fill={colorFor(d[metric])} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
