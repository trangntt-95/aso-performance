'use client';

import { Trophy } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  pct: number | null;
  actual: number;
  expected: number | null;
  runratePct?: number | null;
  runrateTooltip?: string;
}

function toneFor(pct: number | null) {
  if (pct === null) return { ring: '#cbd5e1', label: 'text-slate-500', bg: 'border-slate-200' };
  if (pct >= 1) return { ring: '#059669', label: 'text-emerald-700', bg: 'border-emerald-200 bg-emerald-50/30' };
  if (pct >= 0.9) return { ring: '#f59e0b', label: 'text-amber-700', bg: 'border-amber-200 bg-amber-50/30' };
  if (pct >= 0.7) return { ring: '#f97316', label: 'text-orange-700', bg: 'border-orange-200 bg-orange-50/30' };
  return { ring: '#e11d48', label: 'text-rose-700', bg: 'border-rose-200 bg-rose-50/30' };
}

function runrateTextTone(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return 'text-slate-400';
  if (pct >= 1) return 'text-emerald-700';
  if (pct >= 0.9) return 'text-amber-700';
  if (pct >= 0.7) return 'text-orange-700';
  return 'text-rose-700';
}

export function AdsTargetTile({ label, pct, actual, expected, runratePct, runrateTooltip }: Props) {
  const t = toneFor(pct);
  const size = 72;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = pct === null ? 0 : Math.min(Math.max(pct, 0), 1.5);
  const dashOffset = circumference * (1 - Math.min(clamped, 1));
  const isOver = pct !== null && pct > 1;

  return (
    <div className={cn('rounded-xl border bg-white p-4 sm:p-5 flex items-center gap-4', t.bg)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="#e2e8f0"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={t.ring}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 600ms ease' }}
          />
          {isOver && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r - stroke - 1}
              stroke={t.ring}
              strokeWidth={2}
              fill="none"
              strokeDasharray={`${(circumference - 2 * Math.PI * (stroke + 1)) * Math.min(pct - 1, 0.5)} 9999`}
              strokeLinecap="round"
              opacity={0.5}
            />
          )}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className={cn('text-sm font-semibold tabular-nums leading-none', t.label)}>
            {pct === null ? '—' : `${Math.round(pct * 100)}%`}
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium truncate">
            {label}
          </span>
          <Trophy className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        </div>
        <div className="text-[13px] font-mono tabular-nums text-slate-900 leading-tight">
          <span className="font-semibold">{formatNumber(actual)}</span>
          <span className="text-slate-400 mx-1">/</span>
          <span className="text-slate-600">
            {expected !== null ? formatNumber(Math.round(expected)) : '—'}
          </span>
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">installs vs target</div>
        {runratePct !== undefined && (
          <div
            className={cn('text-[10px] mt-1 font-medium tabular-nums', runrateTextTone(runratePct))}
            title={runrateTooltip}
          >
            Runrate EOM:{' '}
            <span className="font-semibold">
              {runratePct === null ? '—' : `${Math.round(runratePct * 100)}%`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
