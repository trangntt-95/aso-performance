'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HistoryRow } from '@/lib/sheets/types';
import { useMemo } from 'react';
import { parseSheetDate } from '@/lib/utils/format';

interface Props {
  history: HistoryRow[];
  metric: 'users' | 'pos';
}

interface SeriesPoint {
  ts: number;
  organic: number | null;
  paid: number | null;
}

function buildSeries(rows: HistoryRow[], metric: 'users' | 'pos'): SeriesPoint[] {
  const byTs = new Map<number, SeriesPoint>();
  rows.forEach((r) => {
    const d = parseSheetDate(r.snapshotDate);
    if (!d) return;
    const ts = d.getTime();
    if (!byTs.has(ts)) {
      byTs.set(ts, { ts, organic: null, paid: null });
    }
    const point = byTs.get(ts)!;
    const value = metric === 'users' ? r.usersL7D : r.posL7D;
    if (r.surface === 'search_ad') point.paid = value;
    else point.organic = value;
  });
  return Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
}

function formatTick(ts: number | string): string {
  const n = typeof ts === 'number' ? ts : Number(ts);
  if (!Number.isFinite(n) || n === 0) return '';
  const t = new Date(n);
  if (Number.isNaN(t.getTime())) return '';
  return t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function TrendChart({ history, metric }: Props) {
  const data = useMemo(() => buildSeries(history, metric), [history, metric]);

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-xs text-slate-400">
        No history data for this keyword yet.
      </div>
    );
  }

  const isPos = metric === 'pos';

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={formatTick}
            tick={{ fontSize: 10, fill: '#64748b' }}
            stroke="#cbd5e1"
            minTickGap={28}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            stroke="#cbd5e1"
            reversed={isPos}
            allowDecimals={isPos}
            domain={isPos ? [1, 'auto'] : ['auto', 'auto']}
          />
          <Tooltip
            labelFormatter={(label) => formatTick(label as number)}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
            formatter={(v) => (v === null || v === undefined ? '—' : v)}
          />
          <Line
            type="monotone"
            dataKey="organic"
            stroke="#059669"
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
            name="Organic"
          />
          <Line
            type="monotone"
            dataKey="paid"
            stroke="#b45309"
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
            name="Paid"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
