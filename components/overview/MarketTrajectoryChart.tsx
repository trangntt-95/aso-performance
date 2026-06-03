'use client';

import { useState } from 'react';
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
  onWindowClick?: (window: string) => void;
  activeWindow?: string;
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
    <div className="rounded-lg border border-slate-200 bg-white shadow-md p-2.5 text-xs w-[200px] max-w-[200px]">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="font-semibold text-slate-900">{label}</div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          {String(label).slice(1)}d
        </span>
      </div>
      <dl className="space-y-1">
        <div className="flex justify-between items-baseline gap-2">
          <dt className="text-slate-500 truncate">Δ Users</dt>
          <dd className={`font-medium tabular-nums shrink-0 ${toneCls(p.usersDelta)}`}>{fmtPct(p.usersDelta)}</dd>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <dt className="text-slate-500 truncate">Δ Install</dt>
          <dd className={`font-medium tabular-nums shrink-0 ${toneCls(p.getAppDelta)}`}>{fmtPct(p.getAppDelta)}</dd>
        </div>
        <div className="border-t border-slate-100 pt-1 mt-1">
          <dd className="font-semibold text-slate-900 text-[11px] break-words">{v.label}</dd>
        </div>
      </dl>
      <div className="text-[9px] text-indigo-600 mt-1.5 font-medium">Click to focus →</div>
    </div>
  );
}

export function MarketTrajectoryChart({ data, metric, height = 220, onWindowClick, activeWindow }: Props) {
  const [hoverWindow, setHoverWindow] = useState<string | null>(null);
  const handleBarClick = (entry: unknown) => {
    const win = (entry as { window?: string } | null | undefined)?.window;
    if (win && onWindowClick) onWindowClick(win);
  };
  const handleBarEnter = (entry: unknown) => {
    const win = (entry as { window?: string } | null | undefined)?.window;
    if (win) setHoverWindow(win);
  };
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="window"
            tick={(props: unknown) => {
              const p = props as { x?: number | string; y?: number | string; payload?: { value?: string } };
              const x = typeof p.x === 'number' ? p.x : 0;
              const y = typeof p.y === 'number' ? p.y : 0;
              const val = p.payload?.value ?? '';
              const isActive = val === activeWindow;
              const isHover = val === hoverWindow;
              const fill = isActive ? '#4f46e5' : isHover ? '#6366f1' : '#64748b';
              const fontWeight = isActive || isHover ? 700 : 400;
              return (
                <text
                  x={x}
                  y={y + 10}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={fontWeight}
                  fill={fill}
                  style={{ cursor: onWindowClick ? 'pointer' : 'default' }}
                  onClick={() => onWindowClick && onWindowClick(val)}
                  onMouseEnter={() => setHoverWindow(val)}
                  onMouseLeave={() => setHoverWindow(null)}
                >
                  {val} {isHover && onWindowClick ? '↗' : ''}
                </text>
              );
            }}
            stroke="#cbd5e1"
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            stroke="#cbd5e1"
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFmt}
          />
          <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
          <Tooltip
            cursor={{ fill: '#eef2ff' }}
            content={<CustomTooltip />}
            allowEscapeViewBox={{ x: false, y: false }}
            wrapperStyle={{ pointerEvents: 'none', zIndex: 50 }}
          />
          <Bar
            dataKey={metric}
            radius={[6, 6, 0, 0]}
            maxBarSize={42}
            onClick={handleBarClick}
            onMouseEnter={handleBarEnter}
            onMouseLeave={() => setHoverWindow(null)}
            style={{ cursor: onWindowClick ? 'pointer' : 'default' }}
          >
            {data.map((d, i) => {
              const isActive = d.window === activeWindow;
              const isHover = d.window === hoverWindow;
              return (
                <Cell
                  key={i}
                  fill={colorFor(d[metric])}
                  fillOpacity={isHover && !isActive ? 0.85 : 1}
                  stroke={isActive ? '#4f46e5' : isHover ? '#6366f1' : 'none'}
                  strokeWidth={isActive ? 2 : isHover ? 2 : 0}
                  style={{ transition: 'stroke 120ms ease, fill-opacity 120ms ease' }}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
